import Link from "next/link";
import Chart, { type Series } from "@/components/Chart";
import {
  type FullActivity, avgHr, cadence, durSec, getActivitiesByIds, km, num, paceSecPerKm, speedKmh, sportOf,
  strokeDistCm, swimPaceSecPer100,
} from "@/lib/data";
import { MAX_HR } from "@/lib/config";
import { fmtDur, mmss, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const HUB = { run: ["/running", "Run"], ride: ["/cycling", "Bike"], swim: ["/swimming", "Swim"] } as const;

export default async function Compare({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const raw = (await searchParams).ids;
  const ids = [...new Set([raw ?? []].flat().flatMap((x) => String(x).split(",")).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 6);
  const found = await getActivitiesByIds(ids);
  const kind = found.length ? sportOf(found[0].type) : "other";
  const acts = found.filter((a) => sportOf(a.type) === kind);

  if (acts.length < 2 || kind === "other") {
    return (
      <>
        <h1>Compare sessions</h1>
        <p className="lede">Pick at least two sessions of the same sport from the Running, Cycling or Swimming page, then press “Compare selected”.</p>
        <Link className="btn" href="/running">Go to Running</Link>
      </>
    );
  }

  const [href, hubName] = HUB[kind];
  const series: Series[] = acts.map((a) => ({ key: `a${a.id}`, label: `${shortDate(a.day)} · ${(a.name || "Untitled").slice(0, 22)}` }));

  // Overlay rows by split / length index
  const overlay = (getVals: (a: FullActivity) => (number | null)[]) => {
    const cols = acts.map(getVals);
    const len = Math.max(0, ...cols.map((c) => c.length));
    return Array.from({ length: len }, (_, i) => {
      const row: Record<string, number | null> = { x: i + 1 };
      acts.forEach((a, j) => (row[`a${a.id}`] = cols[j][i] ?? null));
      return row;
    });
  };
  const sp = (a: FullActivity) => a.analysis?.splits ?? [];
  const ln = (a: FullActivity) => (a.analysis?.lengths ?? []).map((l) => (l.anom ? null : l));

  const table: [string, (a: FullActivity) => string][] =
    kind === "run" ? [
      ["Distance", (a) => `${km(a).toFixed(2)} km`], ["Time", (a) => fmtDur(durSec(a))],
      ["Avg pace", (a) => { const p = paceSecPerKm(a); return p ? `${mmss(p)}/km` : "–"; }],
      ["Avg HR", (a) => f0(avgHr(a), " bpm")], ["Max HR", (a) => f0(num(a.s.maxHR), " bpm")],
      ["% of max HR", (a) => { const h = avgHr(a); return h ? `${Math.round((h / MAX_HR) * 100)}%` : "–"; }],
      ["Cadence", (a) => f0(cadence(a), " spm")], ["Climbing", (a) => f0(num(a.s.elevationGain), " m")],
    ] : kind === "ride" ? [
      ["Distance", (a) => `${km(a).toFixed(1)} km`], ["Moving time", (a) => fmtDur(num(a.s.movingDuration) ?? durSec(a))],
      ["Avg speed", (a) => { const m = num(a.s.movingDuration) ?? durSec(a); return m ? `${(km(a) / (m / 3600)).toFixed(1)} km/h` : "–"; }],
      ["Avg HR", (a) => f0(avgHr(a), " bpm")], ["Avg power", (a) => f0(a.analysis?.power?.avg ?? num(a.s.avgPower), " W")],
      ["Normalised power", (a) => f0(a.analysis?.power?.np ?? num(a.s.normPower), " W")],
      ["Variability index", (a) => (a.analysis?.power?.vi ? String(a.analysis.power.vi) : "–")],
      ["Peak power", (a) => f0(a.analysis?.power?.max ?? num(a.s.maxPower), " W")], ["Climbing", (a) => f0(num(a.s.elevationGain), " m")],
    ] : [
      ["Distance", (a) => `${Math.round(num(a.s.distance) ?? 0)} m`], ["Time", (a) => fmtDur(durSec(a))],
      ["Avg pace", (a) => { const p = swimPaceSecPer100(a); return p ? `${mmss(p)}/100m` : "–"; }],
      ["Avg HR", (a) => f0(avgHr(a), " bpm")], ["SWOLF", (a) => (num(a.s.averageSwolf) ? a.s.averageSwolf.toFixed(1) : "–")],
      ["Stroke distance", (a) => f0(strokeDistCm(a), " cm")], ["Pool", (a) => (a.analysis?.pool ? `${a.analysis.pool} m` : "open water")],
      ["Longest unbroken", (a) => { const s = a.analysis?.sets ?? []; return s.length ? `${Math.max(...s.map((x) => x.dist))} m` : "–"; }],
    ];

  return (
    <>
      <Link href={href} className="back">← {hubName}</Link>
      <div className="eyebrow" style={{ color: "var(--accent)", marginTop: 10 }}>Compare</div>
      <h1>{acts.length} {hubName.toLowerCase()} sessions</h1>
      <p className="lede">Each colour is one session. The x-axis is {kind === "swim" ? "the length number" : "the kilometre"}.</p>

      <div className="stack">
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  {acts.map((a, i) => (
                    <th key={a.id}><span className="dot" style={{ background: `var(--s${i + 1})`, marginRight: 6 }} /><Link href={`/activity/${a.id}`}>{shortDate(a.day)}</Link></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map(([label, fn]) => (
                  <tr key={label}><td>{label}</td>{acts.map((a) => <td key={a.id} className="mono">{fn(a)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {kind === "run" && (<>
          <Chart title="Pace per km" subtitle="faster is higher" data={overlay((a) => sp(a).map((s) => s.pace))} xKey="x" xUnit=" km" fmt="pace" unit="/km" invert series={series} />
          <Chart title="Heart rate per km" data={overlay((a) => sp(a).map((s) => s.hr))} xKey="x" xUnit=" km" fmt="int" unit=" bpm" series={series} />
          <Chart title="Cadence per km" data={overlay((a) => sp(a).map((s) => s.cad))} xKey="x" xUnit=" km" fmt="int" unit=" spm" series={series} height={190} />
        </>)}
        {kind === "ride" && (<>
          <Chart title="Speed per km" data={overlay((a) => sp(a).map((s) => s.speed))} xKey="x" xUnit=" km" fmt="num" unit=" km/h" series={series} />
          <Chart title="Power per km" data={overlay((a) => sp(a).map((s) => s.pow))} xKey="x" xUnit=" km" fmt="int" unit=" W" series={series} />
          <Chart title="Heart rate per km" data={overlay((a) => sp(a).map((s) => s.hr))} xKey="x" xUnit=" km" fmt="int" unit=" bpm" series={series} height={190} />
        </>)}
        {kind === "swim" && (<>
          <Chart title="Pace per length" subtitle="s/100m equivalent, faster is higher" data={overlay((a) => ln(a).map((l) => l?.pace ?? null))} xKey="x" xUnit=" length" fmt="pace" unit="/100m" invert series={series} />
          <Chart title="SWOLF per length" subtitle="lower is better" data={overlay((a) => ln(a).map((l) => l?.swolf ?? null))} xKey="x" xUnit=" length" fmt="int" series={series} height={190} />
        </>)}
      </div>
    </>
  );
}

const f0 = (v: number | null | undefined, u = "") => (v == null ? "–" : `${Math.round(v)}${u}`);
