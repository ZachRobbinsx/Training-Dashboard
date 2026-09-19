import Link from "next/link";
import {
  type Activity, avgHr, cadence, durSec, km, num, paceSecPerKm, speedKmh, swimPaceSecPer100,
} from "@/lib/data";
import { fmtDur, longDate, mmss } from "@/lib/format";

export type Kind = "run" | "ride" | "swim";

/** Sessions table with checkboxes: tick 2-6 and press Compare. */
export default function SessionList({ activities, kind }: { activities: Activity[]; kind: Kind }) {
  const rows = [...activities].reverse();
  const head =
    kind === "run" ? ["Distance", "Time", "Pace", "Avg HR", "Cadence"]
    : kind === "ride" ? ["Distance", "Time", "Speed", "Avg HR", "Avg power"]
    : ["Distance", "Time", "Pace /100m", "Avg HR", "SWOLF"];

  return (
    <form method="get" action="/compare" className="card">
      <header className="card-head">
        <h3>Sessions</h3>
        <p>Click a session for the full breakdown, or tick 2–6 and compare them.</p>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th><th>Date</th><th>Session</th>
              {head.map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const p = paceSecPerKm(a);
              const sp = swimPaceSecPer100(a);
              const cells =
                kind === "run"
                  ? [`${km(a).toFixed(1)} km`, fmtDur(durSec(a)), p ? `${mmss(p)}/km` : "–", fmt0(avgHr(a)), fmt0(cadence(a))]
                  : kind === "ride"
                  ? [`${km(a).toFixed(1)} km`, fmtDur(num(a.s.movingDuration) ?? durSec(a)), speedKmh(a) ? `${speedKmh(a)!.toFixed(1)} km/h` : "–", fmt0(avgHr(a)), num(a.s.avgPower) ? `${Math.round(a.s.avgPower)} W` : "–"]
                  : [`${Math.round(num(a.s.distance) ?? 0)} m`, fmtDur(durSec(a)), sp ? mmss(sp) : "–", fmt0(avgHr(a)), num(a.s.averageSwolf) ? String(Math.round(a.s.averageSwolf)) : "–"];
              return (
                <tr key={a.id}>
                  <td><input type="checkbox" name="ids" value={a.id} aria-label={`Compare ${a.name}`} /></td>
                  <td>{longDate(a.day)}</td>
                  <td><Link href={`/activity/${a.id}`}>{a.name || "Untitled"}</Link></td>
                  {cells.map((c, i) => <td key={i} className="mono">{c}</td>)}
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={8}>No sessions yet. Run the sync.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button className="btn" type="submit">Compare selected</button>
        <span className="hint">Pick up to 6 sessions of the same sport.</span>
      </div>
    </form>
  );
}

const fmt0 = (v: number | null) => (v == null ? "–" : String(Math.round(v)));