import Link from "next/link";
import Chart from "@/components/Chart";
import Tile from "@/components/Tile";
import {
  BIKE, RUN, SWIM, avg, durSec, getActivities, getDaily, hrvOf, km, lastSync, lastWeeks,
  round, sleepOf, statsOf, weekStart, weightKg, paceSecPerKm, swimPaceSecPer100, num,
} from "@/lib/data";
import { fmtDur, fmtHours, longDate, mmss } from "@/lib/format";

export const dynamic = "force-dynamic";

const latest = <T,>(rows: { day: string; payload: any }[], pick: (p: any) => T | null) => {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = pick(rows[i].payload);
    if (v != null) return v;
  }
  return null;
};

export default async function Overview() {
  const [acts, stats, sleep, hrv, weight, synced] = await Promise.all([
    getActivities(120),
    getDaily("stats", 30),
    getDaily("sleep", 30),
    getDaily("hrv", 30),
    getDaily("weight", 60),
    lastSync(),
  ]);

  const weeks = lastWeeks(12);
  const rows = weeks.map((w) => ({ day: w, Run: 0, Bike: 0, Swim: 0, Other: 0 }));
  for (const a of acts) {
    const r = rows.find((x) => x.day === weekStart(a.day));
    if (!r) continue;
    const h = durSec(a) / 3600;
    if (RUN.includes(a.type)) r.Run += h;
    else if (BIKE.includes(a.type)) r.Bike += h;
    else if (SWIM.includes(a.type)) r.Swim += h;
    else r.Other += h;
  }
  const weekly = rows.map((r) => ({
    day: r.day,
    Run: round(r.Run, 2), Bike: round(r.Bike, 2), Swim: round(r.Swim, 2), Other: round(r.Other, 2),
  }));

  const rhr = latest(stats, (p) => statsOf(p).rhr);
  const rhr7 = avg(stats.slice(-7).map((d) => statsOf(d.payload).rhr));
  const hrvNow = latest(hrv, (p) => hrvOf(p).last);
  const hrvWeekly = latest(hrv, (p) => hrvOf(p).weekly);
  const sleepLast = latest(sleep, (p) => sleepOf(p).total);
  const score = latest(sleep, (p) => sleepOf(p).score);
  const bb = latest(stats, (p) => statsOf(p).bbHigh);
  const steps = latest(stats, (p) => statsOf(p).steps);
  const kg = latest(weight, (p) => weightKg(p));

  const recent = [...acts].reverse().slice(0, 8);
  const week = acts.filter((a) => a.day >= weekStart(new Date().toISOString().slice(0, 10)));

  return (
    <>
      <h1>Overview</h1>
      <p className="lede">
        This week: {week.length} sessions, {fmtHours(week.reduce((s, a) => s + durSec(a), 0) / 3600)}, {round(week.reduce((s, a) => s + km(a), 0), 1)} km.
      </p>

      <div className="tiles">
        <Tile color="var(--hr)" label="Resting HR" value={rhr != null ? String(rhr) : "–"} unit="bpm" sub={rhr7 != null ? `7-day avg ${Math.round(rhr7)}` : undefined} />
        <Tile color="var(--power)" label="HRV (last night)" value={hrvNow != null ? String(hrvNow) : "–"} unit="ms" sub={hrvWeekly != null ? `weekly avg ${hrvWeekly}` : undefined} />
        <Tile color="var(--swim)" label="Sleep" value={sleepLast != null ? fmtHours(sleepLast) : "–"} sub={score != null ? `score ${score}` : undefined} />
        <Tile color="var(--elev)" label="Body battery (peak)" value={bb != null ? String(bb) : "–"} />
        <Tile color="var(--run)" label="Steps" value={steps != null ? steps.toLocaleString("en-GB") : "–"} />
        <Tile color="var(--target)" label="Weight" value={kg != null ? String(round(kg, 1)) : "–"} unit="kg" />
      </div>

      <div className="grid">
        <div className="wide">
          <Chart
            title="Weekly training time"
            subtitle="Hours per week by sport, last 12 weeks"
            data={weekly}
            kind="stack"
            fmt="hours"
            series={[
              { key: "Run", label: "Run", color: "var(--run)" },
              { key: "Bike", label: "Bike", color: "var(--bike)" },
              { key: "Swim", label: "Swim", color: "var(--swim)" },
              { key: "Other", label: "Other", color: "var(--s-other)" },
            ]}
          />
        </div>

        <section className="card wide">
          <header className="card-head"><h3>Recent activities</h3></header>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Activity</th><th>Type</th><th>Dist</th><th>Time</th><th>Pace / speed</th><th>Avg HR</th></tr></thead>
              <tbody>
                {recent.map((a) => {
                  const p = paceSecPerKm(a);
                  return (
                    <tr key={a.id}>
                      <td>{longDate(a.day)}</td>
                      <td><Link href={`/activity/${a.id}`}>{a.name || "Untitled"}</Link></td>
                      <td><span className="tag">{a.type.replace(/_/g, " ")}</span></td>
                      <td>{km(a) ? `${km(a).toFixed(1)} km` : "–"}</td>
                      <td>{fmtDur(durSec(a))}</td>
                      <td>{RUN.includes(a.type) ? (p ? `${mmss(p)}/km` : "–") : SWIM.includes(a.type) ? (swimPaceSecPer100(a) ? `${mmss(swimPaceSecPer100(a)!)}/100m` : "–") : BIKE.includes(a.type) && (num(a.s.averageSpeed) ?? 0) > 0 ? `${((a.s.averageSpeed as number) * 3.6).toFixed(1)} km/h` : "–"}</td>
                      <td>{a.s.averageHR ? Math.round(a.s.averageHR) : "–"}</td>
                    </tr>
                  );
                })}
                {recent.length === 0 && <tr><td colSpan={7}>No activities yet. Run the sync.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <p className="foot">Last synced {synced ?? "never"} (London time)</p>
    </>
  );
}
