"""Pull activities + daily health data from Garmin Connect into Postgres.

    python sync.py                    # last 7 days (what the schedule runs)
    python sync.py --days 30          # last 30 days
    python sync.py --since 2025-01-01 # backfill from a date (resumable: skips days already stored)
"""
import argparse
import datetime as dt
import io
import os
import sys
import time
import zipfile

from garminconnect import Garmin
from psycopg.types.json import Jsonb

import analyse
import common

PAUSE = 0.4  # seconds between Garmin calls - be polite, avoid rate limits
MAX_CONSECUTIVE_FAILURES = 10

# kind -> function(client, iso_date). Add more here to store more data.
FETCHERS = {
    "stats": lambda c, d: c.get_stats(d),
    "sleep": lambda c, d: c.get_sleep_data(d),
    "hrv": lambda c, d: c.get_hrv_data(d),
    "readiness": lambda c, d: c.get_training_readiness(d),
    "training_status": lambda c, d: c.get_training_status(d),
}


def log(msg):
    print(msg, flush=True)


def get_client(conn):
    token_dir = common.new_token_dir()
    have_tokens = common.load_tokens(conn, token_dir)
    email, password = os.environ.get("GARMIN_EMAIL"), os.environ.get("GARMIN_PASSWORD")
    if not have_tokens and not (email and password):
        raise SystemExit("No saved Garmin token. Run login.py once from your computer first.")
    client = Garmin(email, password) if (email and password) else Garmin()
    client.login(token_dir)
    common.save_tokens(conn, token_dir)  # persist any refreshed token
    return client, token_dir


def upsert_daily(conn, day, kind, payload):
    conn.execute(
        """insert into daily_metrics (day, kind, payload) values (%s, %s, %s)
           on conflict (day, kind) do update set payload = excluded.payload, updated_at = now()""",
        (day, kind, Jsonb(payload)),
    )


def existing_kinds(conn, start, end):
    rows = conn.execute(
        "select day, kind from daily_metrics where day between %s and %s", (start, end)
    ).fetchall()
    out = {}
    for d, k in rows:
        out.setdefault(d.isoformat(), set()).add(k)
    return out


def sync_daily(conn, client, start, end, skip_existing):
    have = existing_kinds(conn, start, end) if skip_existing else {}
    recent_cutoff = dt.date.today() - dt.timedelta(days=2)
    disabled = set()
    failures = 0
    day = start
    while day <= end:
        iso = day.isoformat()
        for kind, fn in FETCHERS.items():
            if kind in disabled:
                continue
            if skip_existing and day < recent_cutoff and kind in have.get(iso, set()):
                continue
            try:
                data = fn(client, iso)
                failures = 0
            except AttributeError:
                log(f"  ! this garminconnect version has no '{kind}' call - skipping it")
                disabled.add(kind)
                continue
            except Exception as e:  # noqa: BLE001
                failures += 1
                log(f"  ! {kind} {iso}: {type(e).__name__}: {str(e)[:120]}")
                if failures >= MAX_CONSECUTIVE_FAILURES:
                    raise SystemExit("Too many consecutive Garmin failures - stopping (rate limit or login problem).")
                time.sleep(PAUSE * 4)
                continue
            if data:
                upsert_daily(conn, day, kind, data)
            time.sleep(PAUSE)
        day += dt.timedelta(days=1)
        if day.day == 1 or day > end:
            log(f"  daily data through {iso}")


def sync_weight(conn, client, start, end):
    try:
        data = client.get_body_composition(start.isoformat(), end.isoformat())
    except Exception as e:  # noqa: BLE001
        log(f"  ! weight: {type(e).__name__}: {str(e)[:120]}")
        return
    n = 0
    for entry in (data or {}).get("dateWeightList", []) or []:
        cal = entry.get("calendarDate")
        if cal:
            upsert_daily(conn, cal, "weight", entry)
            n += 1
    log(f"  weight entries: {n}")


def extract_fit(zip_bytes):
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            for name in z.namelist():
                if name.lower().endswith(".fit"):
                    return z.read(name)
    except zipfile.BadZipFile:
        pass
    return zip_bytes  # already a raw FIT


def store_analysis(conn, aid, fit_bytes):
    """Derive per-km / per-length analysis from the FIT and save it next to the activity."""
    try:
        result = analyse.analyse(fit_bytes)
    except Exception as e:  # noqa: BLE001
        log(f"  ! analysis {aid}: {type(e).__name__}: {str(e)[:100]}")
        return
    conn.execute("update activities set analysis = %s where id = %s", (Jsonb(result), aid))


def sync_activities(conn, client, start, end):
    acts = client.get_activities_by_date(start.isoformat(), end.isoformat()) or []
    log(f"  {len(acts)} activities in range")
    for a in acts:
        aid = a["activityId"]
        atype = (a.get("activityType") or {}).get("typeKey")
        start_time = a.get("startTimeGMT")
        if start_time:
            start_time = start_time.replace(" ", "T") + "+00:00"

        splits = None
        try:
            splits = client.get_activity_splits(aid)
            time.sleep(PAUSE)
        except Exception as e:  # noqa: BLE001
            log(f"  ! splits {aid}: {type(e).__name__}")

        conn.execute(
            """insert into activities (id, start_time, activity_type, name, summary, splits)
               values (%s, %s, %s, %s, %s, %s)
               on conflict (id) do update set
                 summary = excluded.summary, splits = coalesce(excluded.splits, activities.splits),
                 activity_type = excluded.activity_type, name = excluded.name, updated_at = now()""",
            (aid, start_time, atype, a.get("activityName"), Jsonb(a), Jsonb(splits) if splits else None),
        )

        has_fit = conn.execute("select 1 from fit_files where activity_id = %s", (aid,)).fetchone()
        if not has_fit:
            try:
                raw = client.download_activity(aid, dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL)
                fit = extract_fit(raw)
                conn.execute(
                    "insert into fit_files (activity_id, data, bytes) values (%s, %s, %s) on conflict do nothing",
                    (aid, fit, len(fit)),
                )
                store_analysis(conn, aid, fit)
                time.sleep(PAUSE)
            except Exception as e:  # noqa: BLE001
                log(f"  ! FIT {aid}: {type(e).__name__}: {str(e)[:100]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--since", type=str, help="YYYY-MM-DD; backfill from this date")
    args = ap.parse_args()

    end = dt.date.today()
    if args.since:
        start = dt.date.fromisoformat(args.since)
        skip_existing = True
    else:
        start = end - dt.timedelta(days=args.days)
        skip_existing = False

    conn = common.connect()
    common.init_schema(conn)
    client, token_dir = get_client(conn)
    log(f"Syncing {start} -> {end}")

    # Activities in 90-day chunks (keeps each Garmin response small during backfills)
    chunk = start
    while chunk <= end:
        chunk_end = min(chunk + dt.timedelta(days=89), end)
        sync_activities(conn, client, chunk, chunk_end)
        chunk = chunk_end + dt.timedelta(days=1)

    sync_weight(conn, client, start, end)
    sync_daily(conn, client, start, end, skip_existing)
    common.save_tokens(conn, token_dir)  # keep the refreshed token for next time
    log("Done.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        print(f"Sync failed: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)
