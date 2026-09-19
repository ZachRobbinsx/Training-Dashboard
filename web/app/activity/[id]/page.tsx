import Link from "next/link";
import { notFound } from "next/navigation";
import Chart from "@/components/Chart";
import Tile from "@/components/Tile";
import { MAX_HR } from "@/lib/config";
import {
  type FullActivity, type Lap, avgHr, cadence, durSec, getActivity, km, num, paceSecPerKm,
  speedKmh, sportOf, strokeDistCm, swimPaceSecPer100, thirds,
} from "@/lib/data";
import { fmtDur, longDate, mmss } from "@/lib/format";

export const dynamic = "force-dynamic";

const HUB = { run: ["/running", "Running", "var(--run)"], ride: ["/cycling", "Cycling", "var(--bike)"], swim: ["/swimming", "Swimming", "var(--swim)"], other: ["/activities", "Activities", "var(--accent)"] } as const;

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) notFound();
  const a = await getActivity(n);
  if (!a) notFound();
  const kind = sportOf(a.type);
  const [href, hubName, color] = HUB[kind];

  return (
    <>
      <Link href={href} className="back">← {hubName}</Link>
      <div className="eyebrow" style={{ color, marginTop: 10 }}>{a.type.replace(/_/g, " ")}</div>
      <h1>{a.name || "Untitled"}</h1>
      <p className="lede">{longDate(a.day)} · {a.time}</p>

      <div className="stack">
        {kind === "run" && <RunView a={a} />}
        {kind === "ride" && <RideView a={a} />}
        {kind === "swim" && <SwimView a={a} />}
        {kind === "other" && <OtherView a={a} />}
        <Laps laps={a.analysis?.laps ?? []} kind={kind} />
        <Notes a={a} />
      </div>
    </>
  );
}

/* ---------------- run ---------------- */
function RunView({ a }: { a: FullActivity }) {
  const splits = a.analysis?.splits ?? [];
  const pace = paceSecPerKm(a);
  const hr = avgHr(a);
  const rows = splits.map((s) => ({ x: s.x, pace: s.pace, hr: s.hr, cad: s.cad, alt: s.alt }));
  const t = { pace: thirds(splits, (s) => s.pace), hr: thirds(splits, (s) => s.hr) };
  const per = Math.floor(splits.length / 3);
  return (
    <>
      <div className="tiles">
        <Tile color="var(--run)" label="Distance" value={km(a).toFixed(2)} unit="km" />
        <Tile color="var(--run)" label="Time" value={fmtDur(durSec(a))} />
        <Tile color="var(--run)" label="Avg pace" value={pace ? mmss(pace) : "–"} unit="/km" />
        <Tile color="var(--hr)" label="Avg HR" value={hr ? String(Math.round(hr)) : "–"} unit="bpm" sub={num(a.s.maxHR) ? `max ${Math.round(a.s.maxHR)}` : undefined} />
        <Tile color="var(--run)" label="Cadence" value={fmt0(cadence(a))} unit="spm" />
        <Tile color="var(--hr)" label="Effort" value={hr ? `${Math.round((hr / MAX_HR) * 100)}%` : "–"} sub="of max HR" />
      </div>
      {splits.length === 0 ? <NoDetail /> : (
        <>
          <Chart title="Pace per km" subtitle="min/km, faster is higher" data={rows} xKey="x" xUnit=" km" fmt="pace" unit="/km" invert color="var(--run)" refs={pace ? [{ y: pace, label: `${mmss(pace)} avg`, color: "var(--run)" }] : []} series={[{ key: "pace", label: "Pace" }]} />
          <Chart title="Heart rate per km" data={rows} xKey="x" xUnit=" km" fmt="int" unit=" bpm" kind="area" color="var(--hr)" domain={["auto", "auto"]} refs={[...(hr ? [{ y: hr, label: `${Math.round(hr)} avg`, color: "var(--hr)" }] : []), { y: MAX_HR, label: `max ${MAX_HR}`, color: "var(--danger)" }]} series={[{ key: "hr", label: "HR" }]} />
          <div className="grid">
            <Chart title="Cadence per km" data={rows} xKey="x" xUnit=" km" fmt="int" unit=" spm" color="var(--run)" series={[{ key: "cad", label: "Cadence" }]} height={190} />
            <Chart title="Elevation" subtitle="metres" data={rows} xKey="x" xUnit=" km" fmt="int" unit=" m" kind="area" color="var(--elev)" domain={["auto", "auto"]} series={[{ key: "alt", label: "Elevation" }]} height={190} />
          </div>
          <Thirds
            title="Pacing thirds"
            rows={[0, 1, 2].map((i) => ({
              label: `km ${i === 0 ? 1 : i * per + 1}–${i === 2 ? splits[splits.length - 1].x : (i + 1) * per}`,
              main: t.pace[i], sub: t.hr[i],
            }))}
            fmtMain={(v) => `${mmss(v)}/km`} fmtSub={(v) => `HR ${Math.round(v)}`} lowerIsBetter
          />
        </>
      )}
    </>
  );
}

/* ---------------- ride ---------------- */
function RideView({ a }: { a: FullActivity }) {
  const splits = a.analysis?.splits ?? [];
  const moving = num(a.s.movingDuration) ?? durSec(a);
  const avgSpeed = moving > 0 ? km(a) / (moving / 3600) : speedKmh(a);
  const hr = avgHr(a);
  const p = a.analysis?.power;
  const rows = splits.map((s) => ({ x: s.x, speed: s.speed, pow: s.pow, hr: s.hr, alt: s.alt }));
  const t = { speed: thirds(splits, (s) => s.speed), pow: thirds(splits, (s) => s.pow), hr: thirds(splits, (s) => s.hr) };
  const per = Math.floor(splits.length / 3);
  const avgPow = p?.avg ?? num(a.s.avgPower);
  const np = p?.np ?? num(a.s.normPower);
  return (
    <>
      <div className="tiles">
        <Tile color="var(--bike)" label="Distance" value={km(a).toFixed(1)} unit="km" />
        <Tile color="var(--bike)" label="Moving time" value={fmtDur(moving)} sub={durSec(a) - moving > 120 ? `${fmtDur(durSec(a))} elapsed` : undefined} />
        <Tile color="var(--bike)" label="Avg speed" value={avgSpeed ? avgSpeed.toFixed(1) : "–"} unit="km/h" sub="moving" />
        <Tile color="var(--hr)" label="Avg HR" value={hr ? String(Math.round(hr)) : "–"} unit="bpm" sub={num(a.s.maxHR) ? `max ${Math.round(a.s.maxHR)}` : undefined} />
        <Tile color="var(--power)" label="Avg power" value={fmt0(avgPow)} unit="W" sub={np ? `NP ${Math.round(np)} W` : undefined} badge={p?.vi ? `VI ${p.vi}` : undefined} />
        <Tile color="var(--target)" label="Peak power" value={fmt0(p?.max ?? num(a.s.maxPower))} unit="W" />
        <Tile color="var(--elev)" label="Climbing" value={fmt0(num(a.s.elevationGain))} unit="m" />
      </div>
      {splits.length === 0 ? <NoDetail /> : (
        <>
          <Chart title="Speed per km" data={rows} xKey="x" xUnit=" km" fmt="num" unit=" km/h" kind="area" color="var(--bike)" refs={avgSpeed ? [{ y: avgSpeed, label: `${avgSpeed.toFixed(1)} avg`, color: "var(--bike)" }] : []} series={[{ key: "speed", label: "Speed" }]} />
          <Chart title="Power per km" data={rows} xKey="x" xUnit=" km" fmt="int" unit=" W" kind="area" color="var(--power)" refs={avgPow ? [{ y: avgPow, label: `${Math.round(avgPow)}W avg`, color: "var(--power)" }] : []} series={[{ key: "pow", label: "Power" }]} />
          <Chart title="Heart rate per km" data={rows} xKey="x" xUnit=" km" fmt="int" unit=" bpm" kind="area" color="var(--hr)" domain={["auto", "auto"]} refs={hr ? [{ y: hr, label: `${Math.round(hr)} avg`, color: "var(--hr)" }] : []} series={[{ key: "hr", label: "HR" }]} height={190} />
          <Chart title="Elevation profile" data={rows} xKey="x" xUnit=" km" fmt="int" unit=" m" kind="area" color="var(--elev)" series={[{ key: "alt", label: "Elevation" }]} height={160} />
          <Thirds
            title="Pacing thirds"
            rows={[0, 1, 2].map((i) => ({
              label: `km ${i === 0 ? 1 : i * per + 1}–${i === 2 ? splits[splits.length - 1].x : (i + 1) * per}`,
              main: t.speed[i], sub: t.pow[i], sub2: t.hr[i],
            }))}
            fmtMain={(v) => `${v.toFixed(1)} km/h`} fmtSub={(v) => `${Math.round(v)} W`} fmtSub2={(v) => `HR ${Math.round(v)}`}
          />
        </>
      )}
    </>
  );
}

/* ---------------- swim ---------------- */
function SwimView({ a }: { a: FullActivity }) {
  const an = a.analysis;
  const lengths = an?.lengths ?? [];
  const clean = lengths.filter((l) => !l.anom);
  const flagged = lengths.length - clean.length;
  const openWater = !lengths.length && (an?.splits?.length ?? 0) > 0;
  const pace = swimPaceSecPer100(a);
  const hr = avgHr(a);
  const stroke = strokeDistCm(a);
  const rows = lengths.map((l) => ({ n: l.n, pace: l.anom ? null : l.pace, swolf: l.anom ? null : l.swolf, strokes: l.anom ? null : l.strokes }));
  const owRows = (an?.splits ?? []).map((s) => ({ x: s.x, pace: s.pace ? s.pace / 10 : null, hr: s.hr }));
  const t = { pace: thirds(clean, (l) => l.pace), swolf: thirds(clean, (l) => l.swolf) };
  const per = Math.floor(clean.length / 3);
  const swolf = num(a.s.averageSwolf);

  return (
    <>
      <div className="tiles">
        <Tile color="var(--swim)" label="Distance" value={String(Math.round(num(a.s.distance) ?? 0))} unit="m" />
        <Tile color="var(--swim)" label="Time" value={fmtDur(durSec(a))} />
        <Tile color="var(--swim)" label="Avg pace" value={pace ? mmss(pace) : "–"} unit="/100m" />
        <Tile color="var(--hr)" label="Avg HR" value={hr ? String(Math.round(hr)) : "–"} unit="bpm" sub={num(a.s.maxHR) ? `max ${Math.round(a.s.maxHR)}` : undefined} />
        {swolf != null && <Tile color="var(--elev)" label="SWOLF" value={swolf.toFixed(1)} sub="lower is better" />}
        {stroke != null && <Tile color="var(--target)" label="Stroke distance" value={String(Math.round(stroke))} unit="cm" />}
        {an?.pool && <Tile color="var(--swim)" label="Pool" value={String(an.pool)} unit="m" sub={`${lengths.length} lengths`} />}
      </div>

      {!an || (!lengths.length && !openWater) ? <NoDetail /> : openWater ? (
        <Chart title="Pace per 100 m" subtitle="open water, from GPS. Faster is higher" data={owRows} xKey="x" xUnit=" km" fmt="pace" unit="/100m" invert color="var(--swim)" refs={pace ? [{ y: pace, label: `${mmss(pace)} avg`, color: "var(--swim)" }] : []} series={[{ key: "pace", label: "Pace" }]} />
      ) : (
        <>
          <Chart title="Pace per length" subtitle={`s/100m equivalent. Faster is higher${flagged ? ` · ${flagged} watch miscount${flagged > 1 ? "s" : ""} left out` : ""}`} data={rows} xKey="n" xUnit=" length" fmt="pace" unit="/100m" invert color="var(--swim)" refs={pace ? [{ y: pace, label: `${mmss(pace)} avg`, color: "var(--swim)" }] : []} series={[{ key: "pace", label: "Pace" }]} />
          <div className="grid">
            <Chart title="SWOLF per length" subtitle="lower is better" data={rows} xKey="n" xUnit=" length" fmt="int" kind="area" color="var(--elev)" domain={["auto", "auto"]} series={[{ key: "swolf", label: "SWOLF" }]} height={190} />
            <Chart title="Strokes per length" data={rows} xKey="n" xUnit=" length" fmt="int" color="var(--swim)" series={[{ key: "strokes", label: "Strokes" }]} height={190} />
          </div>
          {(an?.sets?.length ?? 0) > 0 && (
            <section className="card">
              <header className="card-head"><h3>Sets</h3><p>Unbroken stretches between rests</p></header>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Set</th><th>Lengths</th><th>Distance</th><th>Time</th><th>Pace /100m</th><th>Strokes/length</th></tr></thead>
                  <tbody>
                    {an!.sets!.map((s, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td><td className="mono">{s.from}–{s.to}</td><td className="mono">{s.dist} m</td>
                        <td className="mono">{fmtDur(s.t)}</td><td className="mono">{mmss(s.pace)}</td><td className="mono">{s.strokes ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {per >= 1 && (
            <Thirds
              title="Pacing thirds"
              rows={[0, 1, 2].map((i) => ({
                label: `lengths ${i === 0 ? 1 : i * per + 1}–${i === 2 ? clean.length : (i + 1) * per}`,
                main: t.pace[i], sub: t.swolf[i],
              }))}
              fmtMain={(v) => `${mmss(v)}/100m`} fmtSub={(v) => `SWOLF ${v.toFixed(1)}`} lowerIsBetter
            />
          )}
        </>
      )}
    </>
  );
}

function OtherView({ a }: { a: FullActivity }) {
  return (
    <div className="tiles">
      <Tile label="Distance" value={km(a) ? km(a).toFixed(1) : "–"} unit="km" />
      <Tile label="Time" value={fmtDur(durSec(a))} />
      <Tile color="var(--hr)" label="Avg HR" value={fmt0(avgHr(a))} unit="bpm" />
    </div>
  );
}

/* ---------------- shared bits ---------------- */
function NoDetail() {
  return (
    <div className="card empty" style={{ minHeight: 120 }}>
      Detailed charts aren&apos;t available for this session yet. They come from the FIT file: run the sync (or <span className="mono">python reanalyse.py</span>) and refresh.
    </div>
  );
}

function Thirds({
  title, rows, fmtMain, fmtSub, fmtSub2, lowerIsBetter,
}: {
  title: string;
  rows: { label: string; main: number | null; sub?: number | null; sub2?: number | null }[];
  fmtMain: (v: number) => string;
  fmtSub?: (v: number) => string;
  fmtSub2?: (v: number) => string;
  lowerIsBetter?: boolean;
}) {
  const vals = rows.map((r) => r.main).filter((v): v is number => v != null);
  if (!vals.length) return null;
  const best = lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
  return (
    <section className="card">
      <header className="card-head"><h3>{title}</h3><p>First, middle and last third of the session</p></header>
      <div className="table-wrap">
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className={`mono ${r.main === best ? "best" : ""}`}>{r.main != null ? fmtMain(r.main) : "–"}</td>
                <td className="mono">{r.sub != null && fmtSub ? fmtSub(r.sub) : ""}</td>
                <td className="mono">{r.sub2 != null && fmtSub2 ? fmtSub2(r.sub2) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Laps({ laps, kind }: { laps: Lap[]; kind: string }) {
  if (laps.length < 2) return null;
  return (
    <section className="card">
      <header className="card-head"><h3>Laps</h3></header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Lap</th><th>Time</th><th>Dist</th><th>{kind === "ride" ? "Speed" : kind === "swim" ? "Pace /100m" : "Pace"}</th><th>Avg HR</th>{kind === "ride" && <th>Power</th>}<th>Up / down</th></tr>
          </thead>
          <tbody>
            {laps.map((l) => (
              <tr key={l.n}>
                <td>{l.n}</td>
                <td className="mono">{fmtDur(l.t)}</td>
                <td className="mono">{l.d != null ? (kind === "swim" ? `${Math.round(l.d)} m` : `${(l.d / 1000).toFixed(2)} km`) : "–"}</td>
                <td className="mono">
                  {kind === "ride" ? (l.speed ? `${l.speed.toFixed(1)} km/h` : "–")
                    : kind === "swim" ? (l.t && l.d ? mmss((l.t / l.d) * 100) : "–")
                    : l.pace ? `${mmss(l.pace)}/km` : "–"}
                </td>
                <td className="mono">{fmt0(l.hr)}</td>
                {kind === "ride" && <td className="mono">{l.pow ? `${Math.round(l.pow)} W` : "–"}</td>}
                <td className="mono">{l.asc != null ? `+${Math.round(l.asc)}` : "–"} / {l.desc != null ? `−${Math.round(l.desc)}` : "–"} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Notes({ a }: { a: FullActivity }) {
  return (
    <form method="post" action="/api/notes" className="card">
      <header className="card-head"><h3>Your notes</h3><p>How it felt, what you were working on, race-day lessons</p></header>
      <input type="hidden" name="id" value={a.id} />
      <textarea name="note" defaultValue={a.note} placeholder="Add a note about this session…" />
      <div className="actions"><button className="btn" type="submit">Save note</button></div>
    </form>
  );
}

const fmt0 = (v: number | null | undefined) => (v == null ? "–" : String(Math.round(v)));
