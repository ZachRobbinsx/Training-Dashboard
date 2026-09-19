"""Turn a FIT file into chart-ready analysis.

Produces, depending on the sport:
  - splits: per-km (or per-100m for open-water swims) pace/speed, HR, cadence, power, altitude
  - lengths + sets: per-length pace / strokes / SWOLF for pool swims, grouped into unbroken sets
  - laps: the watch's own laps
  - power summary for rides (normalised power, max power, variability index)

Splits use *moving* time: gaps of more than 15 s between samples are treated as pauses,
so a coffee stop in the middle of a ride does not wreck the per-km speed.
"""
import bisect
import io
import math
import statistics

import fitdecode

PAUSE_GAP_S = 15
DOUBLE_CADENCE_SPORTS = {"running", "walking", "hiking"}  # FIT stores cadence per leg


def _num(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v) if math.isfinite(v) else None


def _fields(frame):
    out = {}
    for f in frame.fields:
        try:
            v = f.value
        except Exception:  # noqa: BLE001
            continue
        if v is not None:
            out[f.name] = v
    return out


def parse(data: bytes):
    records, laps, lengths, session = [], [], [], {}
    with fitdecode.FitReader(io.BytesIO(data), error_handling=fitdecode.ErrorHandling.IGNORE) as fit:
        for frame in fit:
            if not isinstance(frame, fitdecode.FitDataMessage):
                continue
            if frame.name == "record":
                records.append(_fields(frame))
            elif frame.name == "lap":
                laps.append(_fields(frame))
            elif frame.name == "length":
                lengths.append(_fields(frame))
            elif frame.name == "session" and not session:
                session = _fields(frame)
    return records, laps, lengths, session


def _r(v, dp=1):
    return None if v is None else round(v, dp)


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _alt(r):
    return _num(r.get("enhanced_altitude")) if r.get("enhanced_altitude") is not None else _num(r.get("altitude"))


def build_splits(records, step_m, double_cadence):
    """Per-step (default 1 km) splits from record messages."""
    pts = []  # (moving_time_s, distance_m, record)
    moving, prev_t, max_d = 0.0, None, 0.0
    for r in records:
        ts, d = r.get("timestamp"), _num(r.get("distance"))
        if ts is None or d is None:
            continue
        t = ts.timestamp()
        if prev_t is not None and 0 < t - prev_t <= PAUSE_GAP_S:
            moving += t - prev_t
        prev_t = t
        max_d = max(max_d, d)  # keep distance monotonic
        pts.append((moving, max_d, r))
    if len(pts) < 2 or pts[-1][1] < step_m * 0.3:
        return []

    dists = [p[1] for p in pts]
    total = dists[-1]

    def time_at(dist):
        j = bisect.bisect_left(dists, dist)
        if j <= 0:
            return pts[0][0]
        if j >= len(pts):
            return pts[-1][0]
        d0, d1 = dists[j - 1], dists[j]
        t0, t1 = pts[j - 1][0], pts[j][0]
        return t0 if d1 == d0 else t0 + (t1 - t0) * (dist - d0) / (d1 - d0)

    boundaries = []
    b = step_m
    while b <= total + 1e-6:
        boundaries.append(b)
        b += step_m
    if total - (boundaries[-1] if boundaries else 0) >= step_m * 0.3:
        boundaries.append(total)  # final partial split

    out, prev_b, prev_t = [], 0.0, 0.0
    for b in boundaries:
        t_b = time_at(b)
        dur, dist = t_b - prev_t, b - prev_b
        recs = [p[2] for p in pts if prev_b < p[1] <= b]
        if dur > 0 and dist > 0:
            hr = _mean([_num(r.get("heart_rate")) for r in recs])
            pw = _mean([_num(r.get("power")) for r in recs])
            cad = _mean([_num(r.get("cadence")) for r in recs])
            if cad is not None and double_cadence:
                cad *= 2
            alts = [a for a in (_alt(r) for r in recs) if a is not None]
            out.append({
                "x": _r(b / 1000, 2),
                "d": _r(dist, 0),
                "t": _r(dur, 1),
                "pace": _r(dur / (dist / 1000), 1),
                "speed": _r(dist / dur * 3.6, 1),
                "hr": _r(hr, 0),
                "cad": _r(cad, 0),
                "pow": _r(pw, 0),
                "alt": _r(alts[-1], 1) if alts else None,
            })
        prev_b, prev_t = b, t_b
    return out


def normalized_power(records):
    """Coggan NP: 30 s rolling mean of power, 4th-power mean, 4th root. Pauses are skipped."""
    series, last = [], None
    for r in records:
        ts, p = r.get("timestamp"), _num(r.get("power"))
        if ts is None or p is None:
            continue
        s = int(ts.timestamp())
        if last is not None:
            gap = s - last
            if gap <= 0:
                continue
            if gap <= 5:
                series.extend([series[-1]] * (gap - 1))
            # longer gaps = paused: don't fill
        series.append(p)
        last = s
    if len(series) < 60:
        return None
    csum = [0.0]
    for x in series:
        csum.append(csum[-1] + x)
    rolling = [(csum[i + 30] - csum[i]) / 30 for i in range(len(series) - 29)]
    return (sum(v ** 4 for v in rolling) / len(rolling)) ** 0.25


def build_lengths(lengths, pool_len):
    """Per-length swim data, flagged anomalies, and unbroken sets."""
    active_run, sets, out = [], [], []

    def close_set():
        if len(active_run) >= 2:
            dist = len(active_run) * pool_len
            time = sum(x["t"] for x in active_run)
            strokes = _mean([x["strokes"] for x in active_run])
            sets.append({
                "from": active_run[0]["n"], "to": active_run[-1]["n"],
                "lengths": len(active_run), "dist": _r(dist, 0), "t": _r(time, 1),
                "pace": _r(time / dist * 100, 1), "strokes": _r(strokes, 1),
            })
        active_run.clear()

    for ln in lengths:
        t = _num(ln.get("total_timer_time")) or _num(ln.get("total_elapsed_time"))
        if ln.get("length_type") == "idle":
            close_set()
            continue
        if not t or t <= 0:
            continue
        strokes = _num(ln.get("total_strokes"))
        row = {
            "n": len(out) + 1,
            "t": _r(t, 1),
            "pace": _r(t / pool_len * 100, 1),
            "strokes": strokes,
            "swolf": _r(t + strokes, 1) if strokes else None,
            "stroke": ln.get("swim_stroke") if isinstance(ln.get("swim_stroke"), str) else None,
        }
        out.append(row)
        active_run.append(row)
    close_set()

    if out:
        med = statistics.median(x["pace"] for x in out)
        for x in out:  # watch mis-counts: very fast/slow lengths are flagged, not deleted
            x["anom"] = x["pace"] < med * 0.5 or x["pace"] > med * 2.2
    return out, sets


def build_laps(laps, double_cadence):
    out = []
    for i, lp in enumerate(laps, 1):
        t = _num(lp.get("total_timer_time")) or _num(lp.get("total_elapsed_time"))
        d = _num(lp.get("total_distance"))
        spd = _num(lp.get("enhanced_avg_speed")) or _num(lp.get("avg_speed"))
        cad = _num(lp.get("avg_cadence"))
        if cad is not None and double_cadence:
            cad *= 2
        out.append({
            "n": i, "t": _r(t, 1), "d": _r(d, 0),
            "pace": _r(t / (d / 1000), 1) if t and d else None,
            "speed": _r(spd * 3.6, 1) if spd else None,
            "hr": _num(lp.get("avg_heart_rate")), "maxhr": _num(lp.get("max_heart_rate")),
            "pow": _num(lp.get("avg_power")), "cad": _r(cad, 0),
            "asc": _num(lp.get("total_ascent")), "desc": _num(lp.get("total_descent")),
        })
    return out


def analyse(data: bytes) -> dict:
    records, laps, lengths, session = parse(data)
    sport = session.get("sport") if isinstance(session.get("sport"), str) else None
    sub = session.get("sub_sport") if isinstance(session.get("sub_sport"), str) else None
    double_cad = sport in DOUBLE_CADENCE_SPORTS
    out = {"sport": sport, "sub_sport": sub}

    if sport == "swimming":
        active = [x for x in lengths if x.get("length_type") != "idle"]
        pool = _num(session.get("pool_length"))
        total_d = _num(session.get("total_distance"))
        if not pool and active and total_d:
            pool = total_d / len(active)
        if active and pool:
            ls, sets = build_lengths(lengths, pool)
            out.update({"pool": _r(pool, 1), "lengths": ls, "sets": sets})
        else:  # open water: 100 m splits from GPS distance
            out["splits"] = build_splits(records, 100, False)
            out["step"] = 100
    else:
        out["splits"] = build_splits(records, 1000, double_cad)
        out["step"] = 1000

    out["laps"] = build_laps(laps, double_cad)

    if sport == "cycling":
        np_ = normalized_power(records)
        powers = [p for p in (_num(r.get("power")) for r in records) if p is not None]
        avg_p = _num(session.get("avg_power")) or (sum(powers) / len(powers) if powers else None)
        out["power"] = {
            "np": _r(np_, 0),
            "avg": _r(avg_p, 0),
            "max": _num(session.get("max_power")) or (max(powers) if powers else None),
            "vi": _r(np_ / avg_p, 2) if np_ and avg_p else None,
        }
    return out
