import Chart from "@/components/Chart";
import Tile from "@/components/Tile";
import { avg, getDaily, hrvOf, round, sleepOf, statsOf, weightKg } from "@/lib/data";
import { fmtHours } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Recovery() {
  const [stats, sleep, hrv, weight] = await Promise.all([
    getDaily("stats", 60),
    getDaily("sleep", 60),
    getDaily("hrv", 60),
    getDaily("weight", 180),
  ]);

  const sleepRows = sleep.map((d) => {
    const s = sleepOf(d.payload);
    return { day: d.day, Deep: round(s.deep, 2), REM: round(s.rem, 2), Light: round(s.light, 2), Awake: round(s.awake, 2), score: s.score, total: s.total };
  });
  const hrvRows = hrv.map((d) => ({ day: d.day, last: hrvOf(d.payload).last, weekly: hrvOf(d.payload).weekly }));
  const statRows = stats.map((d) => {
    const s = statsOf(d.payload);
    return { day: d.day, rhr: s.rhr, bb: s.bbHigh, stress: s.stress, steps: s.steps };
  });
  const weightRows = weight.map((d) => ({ day: d.day, kg: round(weightKg(d.payload), 1) }));

  const l7 = <T,>(rows: T[], f: (r: T) => number | null) => avg(rows.slice(-7).map(f));
  const sleep7 = l7(sleepRows, (r) => r.total);
  const score7 = l7(sleepRows, (r) => r.score);
  const hrv7 = l7(hrvRows, (r) => r.last);
  const rhr7 = l7(statRows, (r) => r.rhr);

  return (
    <>
      <h1>Recovery &amp; lifestyle</h1>
      <p className="lede">Sleep, HRV, resting heart rate, stress, steps and weight. Tiles show 7-day averages.</p>
      <div className="tiles">
        <Tile label="Sleep (7d avg)" value={sleep7 != null ? fmtHours(sleep7) : "–"} />
        <Tile label="Sleep score (7d)" value={score7 != null ? String(Math.round(score7)) : "–"} />
        <Tile label="HRV (7d avg)" value={hrv7 != null ? String(Math.round(hrv7)) : "–"} unit="ms" />
        <Tile label="Resting HR (7d)" value={rhr7 != null ? String(Math.round(rhr7)) : "–"} unit="bpm" />
      </div>
      <div className="grid">
        <div className="wide">
          <Chart
            title="Sleep stages"
            subtitle="Hours per night, last 60 days"
            data={sleepRows}
            kind="stack"
            fmt="hours"
            series={[
              { key: "Deep", label: "Deep" },
              { key: "REM", label: "REM" },
              { key: "Light", label: "Light" },
              { key: "Awake", label: "Awake", color: "var(--s-other)" },
            ]}
          />
        </div>
        <Chart title="HRV" subtitle="Last-night average vs your weekly average (ms)" data={hrvRows} fmt="int" unit=" ms"
          series={[{ key: "last", label: "Last night" }, { key: "weekly", label: "Weekly avg" }]} />
        <Chart title="Resting heart rate" subtitle="bpm" data={statRows} fmt="int" unit=" bpm" series={[{ key: "rhr", label: "Resting HR" }]} />
        <Chart title="Sleep score" data={sleepRows} fmt="int" domain={[0, 100]} series={[{ key: "score", label: "Score" }]} />
        <Chart title="Body battery" subtitle="Daily peak" data={statRows} fmt="int" domain={[0, 100]} series={[{ key: "bb", label: "Peak" }]} />
        <Chart title="Average stress" subtitle="Garmin stress level, lower is calmer" data={statRows} fmt="int" domain={[0, 100]} series={[{ key: "stress", label: "Stress" }]} />
        <Chart title="Steps" data={statRows} kind="bar" fmt="int" series={[{ key: "steps", label: "Steps" }]} />
        <div className="wide">
          <Chart title="Weight" subtitle="kg, last 6 months" data={weightRows} fmt="num" unit=" kg" series={[{ key: "kg", label: "Weight" }]} height={200} />
        </div>
      </div>
    </>
  );
}
