import Link from "next/link";
import Chart from "@/components/Chart";
import Tile from "@/components/Tile";
import { GYM, avg, durSec, getActivities, getDailySlim, hrvOf, lastWeeks, num, round, weekStart } from "@/lib/data";
import { addDays, londonToday } from "@/lib/coach";
import { fmtDur, longDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Gym() {
  const today = londonToday();
  const [sessions, hrv] = await Promise.all([getActivities(365, GYM), getDailySlim("hrv", 200)]);

  const since = (days: number) => sessions.filter((a) => a.day > addDays(today, -days));
  const last30 = since(30);
  const last56 = since(56);
  const mins = (a: { s: Record<string, unknown> }) => (num(a.s.duration) ?? 0) / 60;

  const weeks = lastWeeks(12);
  const weekly = weeks.map((w) => {
    const inWeek = sessions.filter((a) => weekStart(a.day) === w);
    return { day: w, Sessions: inWeek.length, Minutes: Math.round(inWeek.reduce((s, a) => s + mins(a), 0)) };
  });

  const hrRows = sessions
    .slice(-20)
    .map((a) => ({ day: a.day, hr: num(a.s.averageHR) != null ? Math.round(a.s.averageHR as number) : null }));

  // How HRV responds the morning after a gym day, versus your 90-night baseline.
  const hrvPts = hrv.map((d) => ({ day: d.day, v: hrvOf(d.payload).last })).filter((x): x is { day: string; v: number } => x.v != null);
  const base = avg(hrvPts.slice(-90).map((p) => p.v));
  const byDay = new Map(hrvPts.map((p) => [p.day, p.v]));
  const afterPct: number[] = [];
  if (base) {
    for (const a of sessions) {
      const next = byDay.get(addDays(a.day, 1));
      if (next != null && a.day >= addDays(today, -120)) afterPct.push((next / base - 1) * 100);
    }
  }
  const afterAvg = afterPct.length >= 3 ? avg(afterPct) : null;

  const recent = [...sessions].reverse().slice(0, 25);

  return (
    <>
      <h1>Gym</h1>
      <p className="lede">Strength, HIIT and gym-based sessions. Open a session to add notes on what you lifted and how it felt.</p>

      <div className="tiles">
        <Tile color="var(--power)" label="Sessions (30 days)" value={String(last30.length)} />
        <Tile color="var(--power)" label="Per week (8 wks)" value={String(round(last56.length / 8, 1))} />
        <Tile color="var(--power)" label="Avg duration" value={last30.length ? fmtDur(avg(last30.map(durSec))) : "–"} />
        <Tile color="var(--hr)" label="Avg HR (30 days)" value={last30.length && avg(last30.map((a) => num(a.s.averageHR))) ? String(Math.round(avg(last30.map((a) => num(a.s.averageHR)))!)) : "–"} unit="bpm" />
      </div>

      <div className="grid">
        <Chart title="Sessions per week" subtitle="Last 12 weeks" data={weekly} kind="bar" fmt="int" color="var(--power)" series={[{ key: "Sessions", label: "Sessions" }]} height={200} />
        <Chart title="Gym minutes per week" subtitle="Last 12 weeks" data={weekly} kind="bar" fmt="int" unit=" min" color="var(--power)" series={[{ key: "Minutes", label: "Minutes" }]} height={200} />
        <div className="wide">
          <Chart title="Average heart rate per session" subtitle="Last 20 sessions, bpm" data={hrRows} fmt="int" unit=" bpm" color="var(--hr)" series={[{ key: "hr", label: "Avg HR" }]} height={200} />
        </div>

        <section className="card wide">
          <header className="card-head"><h3>Recovery after gym days</h3></header>
          <p style={{ margin: "4px 0" }}>
            {afterAvg != null
              ? `The morning after a gym session your HRV averages ${afterAvg >= 0 ? "+" : "−"}${Math.abs(Math.round(afterAvg * 10) / 10)}% versus your 90-night baseline (${afterPct.length} sessions). ${afterAvg <= -8 ? "Gym days take a real bite out of your recovery. Space them away from hard endurance days." : afterAvg >= -3 ? "Your body absorbs gym sessions well." : "A mild dip. Worth watching if you stack them with hard sessions."}`
              : "Not enough gym sessions with matching HRV data yet."}
          </p>
        </section>

        <section className="card wide">
          <header className="card-head"><h3>Recent sessions</h3></header>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Session</th><th>Type</th><th>Duration</th><th>Avg HR</th><th>Max HR</th><th>Calories</th></tr></thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id}>
                    <td>{longDate(a.day)}</td>
                    <td><Link href={`/activity/${a.id}`}>{a.name || "Untitled"}</Link></td>
                    <td><span className="tag">{a.type.replace(/_/g, " ")}</span></td>
                    <td>{fmtDur(durSec(a))}</td>
                    <td>{num(a.s.averageHR) ? Math.round(a.s.averageHR) : "–"}</td>
                    <td>{num(a.s.maxHR) ? Math.round(a.s.maxHR) : "–"}</td>
                    <td>{num(a.s.calories) ? Math.round(a.s.calories) : "–"}</td>
                  </tr>
                ))}
                {recent.length === 0 && <tr><td colSpan={7}>No gym sessions yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
