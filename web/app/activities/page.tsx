import Link from "next/link";
import { RUN, SWIM, avgHr, durSec, getActivities, km, num, paceSecPerKm, swimPaceSecPer100 } from "@/lib/data";
import { fmtDur, longDate, mmss } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Activities() {
  const acts = (await getActivities(365)).reverse().slice(0, 150);
  return (
    <>
      <h1>Activities</h1>
      <p className="lede">Your 150 most recent activities.</p>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Time</th><th>Activity</th><th>Type</th><th>Dist</th><th>Duration</th><th>Pace / speed</th><th>Avg HR</th><th>Max HR</th></tr>
            </thead>
            <tbody>
              {acts.map((a) => {
                let pace = "–";
                if (RUN.includes(a.type)) {
                  const p = paceSecPerKm(a);
                  pace = p ? `${mmss(p)}/km` : "–";
                } else if (SWIM.includes(a.type)) {
                  const p = swimPaceSecPer100(a);
                  pace = p ? `${mmss(p)}/100m` : "–";
                } else if ((num(a.s.averageSpeed) ?? 0) > 0) {
                  pace = `${((a.s.averageSpeed as number) * 3.6).toFixed(1)} km/h`;
                }
                const dist = SWIM.includes(a.type) ? `${Math.round(num(a.s.distance) ?? 0)} m` : km(a) ? `${km(a).toFixed(1)} km` : "–";
                return (
                  <tr key={a.id}>
                    <td>{longDate(a.day)}</td>
                    <td>{a.time}</td>
                    <td><Link href={`/activity/${a.id}`}>{a.name || "Untitled"}</Link></td>
                    <td><span className="tag">{a.type.replace("road_biking", "cycling").replace(/_/g, " ")}</span></td>
                    <td>{dist}</td>
                    <td>{fmtDur(durSec(a))}</td>
                    <td>{pace}</td>
                    <td>{avgHr(a) ? Math.round(avgHr(a)!) : "–"}</td>
                    <td>{num(a.s.maxHR) ? Math.round(a.s.maxHR) : "–"}</td>
                  </tr>
                );
              })}
              {acts.length === 0 && <tr><td colSpan={9}>No activities yet. Run the sync.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
