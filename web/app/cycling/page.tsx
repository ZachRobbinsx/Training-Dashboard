import Chart from "@/components/Chart";
import SessionList from "@/components/SessionList";
import Tile from "@/components/Tile";
import { BIKE, avg, avgHr, durSec, getActivities, km, lastWeeks, num, round, speedKmh, weekStart } from "@/lib/data";
import { fmtHours } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Cycling() {
  const acts = (await getActivities(1500, BIKE)).filter((a) => km(a) > 1);
  const per = acts.map((a) => ({
    day: a.day,
    speed: round(speedKmh(a), 1),
    hr: round(avgHr(a), 0),
    power: round(num(a.s.avgPower), 0),
    np: round(num(a.s.normPower), 0),
    peak: round(num(a.s.maxPower), 0),
  }));

  const weekly = lastWeeks(16).map((w) => ({
    day: w,
    km: round(acts.filter((a) => weekStart(a.day) === w).reduce((s, a) => s + km(a), 0), 0),
  }));

  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const last30 = acts.filter((a) => a.day >= cutoff);
  const dist30 = last30.reduce((s, a) => s + km(a), 0);
  const time30 = last30.reduce((s, a) => s + durSec(a), 0);
  const elev30 = last30.reduce((s, a) => s + (num(a.s.elevationGain) ?? 0), 0);
  const pw30 = avg(last30.map((a) => num(a.s.avgPower)));
  const hasPower = per.some((r) => r.power != null);

  return (
    <>
      <div className="eyebrow" style={{ color: "var(--bike)" }}>Cycling</div>
      <h1>Cycling progress</h1>
      <p className="lede">Rides over 1 km, including commutes. Tick two or more rides below to compare them.</p>
      <div className="tiles">
        <Tile color="var(--bike)" label="Distance (30d)" value={String(Math.round(dist30))} unit="km" sub={`${last30.length} rides`} />
        <Tile color="var(--bike)" label="Time (30d)" value={fmtHours(time30 / 3600)} />
        <Tile color="var(--elev)" label="Climbing (30d)" value={String(Math.round(elev30))} unit="m" />
        <Tile color="var(--power)" label="Avg power (30d)" value={pw30 ? String(Math.round(pw30)) : "–"} unit="W" />
      </div>
      <div className="grid">
        <Chart title="Weekly distance" subtitle="km per week" data={weekly} kind="bar" fmt="int" unit=" km" color="var(--bike)" series={[{ key: "km", label: "Distance" }]} />
        <Chart title="Average speed" subtitle="km/h per ride" data={per} fmt="num" unit=" km/h" color="var(--bike)" series={[{ key: "speed", label: "Speed" }]} />
        <Chart title="Average heart rate" subtitle="bpm per ride" data={per} fmt="int" unit=" bpm" color="var(--hr)" series={[{ key: "hr", label: "Avg HR" }]} />
        {hasPower && <Chart title="Power" subtitle="average and normalised, watts per ride" data={per} fmt="int" unit=" W" series={[{ key: "power", label: "Average", color: "var(--power)" }, { key: "np", label: "Normalised", color: "var(--bike)" }]} />}
        {hasPower && <div className="wide"><Chart title="Peak power (sprint)" subtitle="highest single-second power in each ride" data={per} fmt="int" unit=" W" color="var(--target)" series={[{ key: "peak", label: "Peak power" }]} height={200} /></div>}
      </div>
      <div className="section-title">Rides</div>
      <SessionList activities={acts} kind="ride" />
    </>
  );
}
