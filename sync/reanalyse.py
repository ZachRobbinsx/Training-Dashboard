"""Re-run the FIT analysis on activities already stored in the database.

    python reanalyse.py          # only activities that have no analysis yet
    python reanalyse.py --all    # recompute everything (after changing analyse.py)
"""
import sys

from psycopg.types.json import Jsonb

import analyse
import common


def main():
    everything = "--all" in sys.argv
    conn = common.connect()
    common.init_schema(conn)
    where = "" if everything else "where a.analysis is null"
    rows = conn.execute(
        f"select f.activity_id from fit_files f join activities a on a.id = f.activity_id {where} order by a.start_time"
    ).fetchall()
    print(f"{len(rows)} activities to analyse")
    ok = 0
    for (aid,) in rows:
        data = conn.execute("select data from fit_files where activity_id = %s", (aid,)).fetchone()[0]
        try:
            result = analyse.analyse(bytes(data))
        except Exception as e:  # noqa: BLE001
            print(f"  ! {aid}: {type(e).__name__}: {str(e)[:100]}")
            continue
        conn.execute("update activities set analysis = %s where id = %s", (Jsonb(result), aid))
        ok += 1
    print(f"Done: {ok} analysed")


if __name__ == "__main__":
    main()
