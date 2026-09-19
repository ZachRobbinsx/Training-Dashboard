import Chart from "@/components/Chart";
import SessionList from "@/components/SessionList";
import Tile from "@/components/Tile";
import { RUN, avg, avgHr, cadence, durSec, getActivities, km, lastWeeks, paceSecPerKm, round, weekStart } from "@/lib/data";
import { mmss } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Running() {
  const acts = (await getActivities(1500, RUN)).filter((a) => km(a) > 0.5);
  const per = acts.map((a) => {
    const p = paceSecPerKm(a);
    const hr = avgHr(a);
    return {
      day: a.day,
      pace: round(p, 0),
      hr: round(hr, 0),
      cad: round(cadence(a), 0),
      // aerobic efficiency: metres per minute per heartbeat-per-minute (higher = fitter)
      eff: p && hr ? round(60000 / p / hr, 2) : null,
    };
  });

  const weekly = lastWeeks(16).map((w) => ({
    day: w,
    km: round(acts.filter((a) => weekStart(a.day) === w).reduce((s, a) => s + km(a), 0), 1),
  }));

  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const last30 = acts.filter((a) => a.day >= cutoff);
  const dist30 = last30.reduce((s, a) => s + km(a), 0);
  const time30 = last30.reduce((s, a) => s + durSec(a), 0);
  const pace30 = dist30 > 0 ? time30 / dist30 : null;

  return (
    <>
      <div className="eyebrow" style={{ color: "var(--run)" }}>Running</div>
      <h1>Running progress</h1>
      <p className="lede">Trends across all runs, then your sessions below.</p>
      <div className="tiles">
        <Tile color="var(--run)" label="Distance (30d)" value={dist30.toFixed(1)} unit="km" sub={`${last30.length} runs`} />
        <Tile color="var(--run)" label="Avg pace (30d)" value={pace30 ? mmss(pace30) : "–"} unit="/km" />
        <Tile color="var(--hr)" label="Avg HR (30d)" value={fmt(avg(last30.map(avgHr)))} unit="bpm" />
        <Tile color="var(--run)" label="Cadence (30d)" value={fmt(avg(last30.map(cadence)))} unit="spm" />
      </div>
      <div className="grid">
        <Chart title="Pace per run" subtitle="min/km, faster is higher" data={per} fmt="pace" unit="/km" invert color="var(--run)" series={[{ key: "pace", label: "Pace" }]} />
        <Chart title="Aerobic efficiency" subtitle="speed per heartbeat, higher = fitter" data={per} fmt="num2" color="var(--run)" series={[{ key: "eff", label: "Efficiency" }]} />
        <Chart title="Average heart rate" subtitle="bpm per run" data={per} fmt="int" unit=" bpm" color="var(--hr)" series={[{ key: "hr", label: "Avg HR" }]} />
        <Chart title="Cadence" subtitle="steps per minute per run" data={per} fmt="int" unit=" spm" color="var(--run)" series={[{ key: "cad", label: "Cadence" }]} />
        <div className="wide">
          <Chart title="Weekly distance" subtitle="km per week, last 16 weeks" data={weekly} kind="bar" fmt="num" unit=" km" color="var(--run)" series={[{ key: "km", label: "Distance" }]} height={200} />
        </div>
      </div>
      <div className="section-title">Sessions</div>
      <SessionList activities={acts} kind="run" />
    </>
  );
}

const fmt = (v: number | null) => (v == null ? "–" : String(Math.round(v)));
