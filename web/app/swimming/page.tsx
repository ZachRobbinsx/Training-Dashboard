import Chart from "@/components/Chart";
import SessionList from "@/components/SessionList";
import Tile from "@/components/Tile";
import { SWIM, avg, getActivities, num, round, strokeDistCm, swimPaceSecPer100 } from "@/lib/data";
import { SWIM_STROKE_TARGET_CM } from "@/lib/config";
import { fmtDur, mmss } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Swimming() {
  const acts = (await getActivities(1500, SWIM)).filter((a) => (num(a.s.distance) ?? 0) >= 100);
  const per = acts.map((a) => ({
    day: a.day,
    pace: round(swimPaceSecPer100(a), 0),
    swolf: round(num(a.s.averageSwolf), 1),
    stroke: round(strokeDistCm(a), 0),
    dist: Math.round(num(a.s.distance) ?? 0),
    unbroken: a.sets?.length ? Math.max(...a.sets.map((s) => s.dist)) : null,
  }));

  const recent = acts.slice(-5);
  const pace = avg(recent.map(swimPaceSecPer100));
  const swolf = avg(recent.map((a) => num(a.s.averageSwolf)));
  const stroke = avg(recent.map(strokeDistCm));

  // longest unbroken swim and the pace it was swum at
  let best: { dist: number; t: number; pace: number; day: string } | null = null;
  for (const a of acts) for (const s of a.sets ?? []) if (!best || s.dist > best.dist) best = { dist: s.dist, t: s.t, pace: s.pace, day: a.day };

  return (
    <>
      <div className="eyebrow" style={{ color: "var(--swim)" }}>Swimming</div>
      <h1>Swimming progress</h1>
      <p className="lede">Trends across all swims. Tiles use your last 5 swims.</p>
      <div className="tiles">
        <Tile color="var(--swim)" label="Pace" value={pace ? mmss(pace) : "–"} unit="/100m" />
        <Tile color="var(--elev)" label="SWOLF" value={swolf ? swolf.toFixed(1) : "–"} sub="lower is better" />
        <Tile color="var(--target)" label="Stroke distance" value={stroke ? String(Math.round(stroke)) : "–"} unit="cm" sub={`target ${SWIM_STROKE_TARGET_CM[0]}–${SWIM_STROKE_TARGET_CM[1]} cm`} />
        <Tile color="var(--swim)" label="Longest unbroken" value={best ? `${best.dist}` : "–"} unit="m" sub={best ? `${fmtDur(best.t)} at ${mmss(best.pace)}/100m` : "needs FIT analysis"} />
      </div>
      <div className="grid">
        <Chart title="Pace per 100 m" subtitle="per swim, faster is higher" data={per} fmt="pace" unit="/100m" invert color="var(--swim)" series={[{ key: "pace", label: "Pace" }]} />
        <Chart title="SWOLF" subtitle="lower is better" data={per} fmt="num" color="var(--elev)" series={[{ key: "swolf", label: "SWOLF" }]} />
        <Chart title="Stroke distance" subtitle="cm per stroke, shaded band = your target" data={per} fmt="int" unit=" cm" band={{ y1: SWIM_STROKE_TARGET_CM[0], y2: SWIM_STROKE_TARGET_CM[1], label: "target" }} color="var(--swim)" series={[{ key: "stroke", label: "Stroke distance" }]} />
        <Chart title="Distance per swim" subtitle="metres" data={per} kind="bar" fmt="int" unit=" m" color="var(--swim)" series={[{ key: "dist", label: "Distance" }, ]} />
        <div className="wide"><Chart title="Longest unbroken set" subtitle="metres swum without stopping, per session" data={per} kind="bar" fmt="int" unit=" m" color="var(--swim)" series={[{ key: "unbroken", label: "Unbroken" }]} height={190} /></div>
      </div>
      <div className="section-title">Sessions</div>
      <SessionList activities={acts} kind="swim" />
    </>
  );
}
