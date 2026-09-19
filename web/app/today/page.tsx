import Chart from "@/components/Chart";
import Tile from "@/components/Tile";
import {
  type Daily, avg, durSec, getActivities, getDaily, getDailySlim, hrvOf, km, lastSync, round, sleepOf, statsOf, weekStart, weightKg,
} from "@/lib/data";
import { addDays, buildCoach, type Session } from "@/lib/coach";
import { COACH } from "@/lib/config";
import { fmtHours, longDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
const latest = <T,>(rows: Daily[], pick: (p: any) => T | null): T | null => {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = pick(rows[i].payload);
    if (v != null) return v;
  }
  return null;
};

const LEVEL_LABEL = { green: "Green · ready", amber: "Amber · go easy", red: "Red · recover" } as const;
const STATUS_LABEL = { good: "Normal", watch: "Watch", low: "Flag", unknown: "No data" } as const;
const STATUS_COLOR = { good: "var(--ok)", watch: "var(--warn)", low: "var(--bad)", unknown: "var(--text-muted)" } as const;
const NEUTRAL = "var(--text-secondary)";
const SPORT_COLOR = { bike: "var(--bike)", swim: "var(--swim)", run: "var(--run)", rest: "var(--text-muted)", gym: "var(--power)" } as const;

export default async function Today() {
  const [acts, stats, sleep, hrv, readiness, weight, synced] = await Promise.all([
    getActivities(200),
    getDailySlim("stats", 200),
    getDailySlim("sleep", 200),
    getDailySlim("hrv", 200),
    getDaily("readiness", 10),
    getDaily("weight", 60),
    lastSync(),
  ]);
  const c = buildCoach({ acts, stats, sleep, hrv, readiness, weight });
  const s = c.session;
  const st = (key: string) => c.signals.find((g) => g.key === key)?.status ?? "unknown";
  const readinessStatus = c.garmin?.score == null ? "unknown" : c.garmin.score >= 70 ? "good" : c.garmin.score >= 40 ? "watch" : "low";
  const runRatio = c.runMinutes.cap > 0 ? c.runMinutes.last7 / c.runMinutes.cap : 0;
  const runStatus = runRatio <= 0.75 ? "good" : runRatio <= 1 ? "watch" : "low";

  const rhr = latest(stats, (p) => statsOf(p).rhr);
  const rhr7 = avg(stats.slice(-7).map((d) => statsOf(d.payload).rhr));
  const hrvNow = latest(hrv, (p) => hrvOf(p).last);
  const hrvWeekly = latest(hrv, (p) => hrvOf(p).weekly);
  const hrv7 = avg(hrv.slice(-7).map((d) => hrvOf(d.payload).last));
  const sleepLast = latest(sleep, (p) => sleepOf(p).total);
  const sleepScore = latest(sleep, (p) => sleepOf(p).score);
  const sleep7 = avg(sleep.slice(-7).map((d) => sleepOf(d.payload).total));
  const bb = latest(stats, (p) => statsOf(p).bbHigh);
  const bb7 = avg(stats.slice(-7).map((d) => statsOf(d.payload).bbHigh));
  const kg = latest(weight, (p) => weightKg(p));
  const wRows = weight.map((d) => ({ day: d.day, v: weightKg(d.payload) })).filter((r): r is { day: string; v: number } => r.v != null);
  const w7 = avg(wRows.filter((r) => r.day > addDays(c.today, -7)).map((r) => r.v));
  const wPrev = avg(wRows.filter((r) => r.day <= addDays(c.today, -7) && r.day > addDays(c.today, -14)).map((r) => r.v));
  const week = acts.filter((a) => a.day >= weekStart(c.today));
  const weekHours = week.reduce((t, a) => t + durSec(a), 0) / 3600;
  const weekKm = week.reduce((t, a) => t + km(a), 0);

  // Sessions: this week's hours so far against your average of the previous four full weeks, pro-rated for the days elapsed.
  const thisMonday = weekStart(c.today);
  const prevHours = [1, 2, 3, 4].map((i) => {
    const from = addDays(thisMonday, -7 * i);
    const to = addDays(from, 7);
    return acts.filter((a) => a.day >= from && a.day < to).reduce((t, a) => t + durSec(a), 0) / 3600;
  });
  const prevAvg = avg(prevHours);
  const elapsed = (new Date(c.today + "T00:00:00Z").getUTCDay() + 6) % 7 + 1; // Mon=1 ... Sun=7
  const expectedHours = prevAvg != null ? (prevAvg * elapsed) / 7 : null;
  const sessRatio = expectedHours && elapsed >= 2 ? weekHours / expectedHours : null;
  const sessStatus: "good" | "watch" | "low" | "unknown" = sessRatio == null ? "unknown" : sessRatio > 1.6 ? "low" : sessRatio > 1.3 || sessRatio < 0.4 ? "watch" : "good";
  const sessBadge = sessRatio == null ? "Too early" : sessRatio > 1.6 ? "Heavy" : sessRatio > 1.3 ? "Busy" : sessRatio < 0.4 ? "Light" : "On track";

  // Form: fitness minus fatigue, judged relative to your fitness level.
  const formRatio = c.load.form / Math.max(c.load.ctl, 10);
  const formStatus: "good" | "watch" | "low" = formRatio < -0.25 ? "low" : formRatio < -0.1 ? "watch" : "good";
  const formBadge = formRatio < -0.25 ? "Fatigued" : formRatio < -0.1 ? "Tired" : formRatio > 0.1 ? "Fresh" : "Balanced";

  // Weight: change in the 7-day average versus the week before. Stable is treated as good.
  const wDelta = w7 != null && wPrev != null ? w7 - wPrev : null;
  const wStatus: "good" | "watch" | "low" | "unknown" = wDelta == null ? "unknown" : Math.abs(wDelta) <= 0.7 ? "good" : Math.abs(wDelta) <= 1.5 ? "watch" : "low";
  const wBadge = wDelta == null ? "No trend" : Math.abs(wDelta) <= 0.7 ? "Stable" : Math.abs(wDelta) <= 1.5 ? "Changing" : "Big swing";

  return (
    <>
      <h1>Overview</h1>
      <p className="lede">
        {longDate(c.today)}. Built from your sleep, HRV, resting heart rate, body battery and recent training. Last synced {synced ?? "never"} (London time). Tile colours show status: green is normal, amber is worth watching, red is a flag, grey means not enough data yet.
      </p>

      <h2 className="sect">Status</h2>
      <section className="card hero" data-s={c.readiness.level}>
        <div className="eyebrow" style={{ color: "var(--state)" }}>{LEVEL_LABEL[c.readiness.level]}</div>
        <h2>{c.readiness.headline}</h2>
        <p>{c.readiness.summary}</p>
      </section>
      {c.notes.map((n) => (
        <p key={n} className="lede" style={{ marginTop: 10 }}>{n}</p>
      ))}

      <h2 className="sect">Daily</h2>
      <div className="tiles">
        <Tile
          color={STATUS_COLOR[st("sleep")]}
          badge={STATUS_LABEL[st("sleep")]}
          label="Sleep"
          value={sleepLast != null ? fmtHours(sleepLast) : "–"}
          sub={[sleepScore != null ? `score ${sleepScore}` : null, sleep7 != null ? `7-day avg ${fmtHours(sleep7)}` : null].filter(Boolean).join(" · ") || undefined}
        />
        <Tile
          color={STATUS_COLOR[st("hrv")]}
          badge={STATUS_LABEL[st("hrv")]}
          label="HRV (last night)"
          value={hrvNow != null ? String(Math.round(hrvNow)) : "–"}
          unit="ms"
          sub={hrv7 != null ? `7-day avg ${Math.round(hrv7)}${hrvWeekly != null ? ` · Garmin ${Math.round(hrvWeekly)}` : ""}` : undefined}
        />
        <Tile color={STATUS_COLOR[st("rhr")]} badge={STATUS_LABEL[st("rhr")]} label="Resting HR" value={rhr != null ? String(Math.round(rhr)) : "–"} unit="bpm" sub={rhr7 != null ? `7-day avg ${Math.round(rhr7)}` : undefined} />
        <Tile
          color={STATUS_COLOR[readinessStatus]}
          badge={STATUS_LABEL[readinessStatus]}
          label="Garmin readiness"
          value={c.garmin?.score != null ? String(Math.round(c.garmin.score)) : "–"}
          sub={c.garmin?.level ? c.garmin.level.toLowerCase() : "Garmin's own score"}
        />
        <Tile color={STATUS_COLOR[st("bb")]} badge={STATUS_LABEL[st("bb")]} label="Body battery (peak)" value={bb != null ? String(Math.round(bb)) : "–"} sub={bb7 != null ? `7-day avg ${Math.round(bb7)}` : undefined} />
      </div>

      <h2 className="sect">Weekly</h2>
      <div className="tiles">
        <Tile
          color={STATUS_COLOR[sessStatus]}
          badge={sessBadge}
          label="Sessions this week"
          value={String(week.length)}
          unit="sessions"
          sub={`${fmtHours(weekHours)} · ${round(weekKm, 1)} km${prevAvg != null ? ` · usual week ${fmtHours(prevAvg)}` : ""}`}
        />
        <Tile color={STATUS_COLOR[runStatus]} badge={runStatus === "good" ? "Room" : runStatus === "watch" ? "Near cap" : "Over cap"} label="Run min (7 days)" value={String(c.runMinutes.last7)} unit={`/ ${c.runMinutes.cap}`} sub="weekly cap" />
        <Tile color={STATUS_COLOR[st("load")]} badge={STATUS_LABEL[st("load")]} label="Load vs 4-wk avg" value={c.load.acwr != null ? `${c.load.acwr.toFixed(2)}×` : "–"} sub="sweet spot 0.8–1.3" />
        <Tile color={STATUS_COLOR[formStatus]} badge={formBadge} label="Form" value={String(c.load.form)} sub={`fitness ${c.load.ctl} · fatigue ${c.load.atl}`} />
        <Tile
          color={STATUS_COLOR[wStatus]}
          badge={wBadge}
          label="Weight"
          value={kg != null ? String(round(kg, 1)) : "–"}
          unit="kg"
          sub={
            w7 != null
              ? `7-day avg ${round(w7, 1)} kg${wDelta != null ? ` · ${wDelta >= 0 ? "+" : "−"}${Math.abs(round(wDelta, 1)!)} vs prior week` : ""}`
              : "no weigh-in in the last 7 days"
          }
        />
      </div>

      <h2 className="sect">Workout</h2>
      <div className="grid">
        <section className="card wide session">
          <header className="card-head"><h3>Suggested session</h3></header>
          <SessionBlock s={s} />
        </section>

        {c.alternatives.length > 0 && (
          <section className="card wide session">
            <header className="card-head">
              <h3>{c.alternatives.length > 1 ? "Or, if you'd rather do something else" : "Or, if you'd rather not"}</h3>
              <p>Same recovery picture, different way to spend it.</p>
            </header>
            {c.alternatives.map((alt, i) => (
              <div key={alt.title} className={i > 0 ? "alt-sep" : undefined}>
                <SessionBlock s={alt} showWhy={false} />
              </div>
            ))}
          </section>
        )}

        <section className="card" data-s={c.run.allowed ? "good" : "watch"}>
          <header className="card-head"><h3>Can you run today?</h3></header>
          <p style={{ margin: "4px 0", fontWeight: 600 }}>
            <span className="pill" data-s={c.run.allowed ? "good" : "watch"}>{c.run.allowed ? "Optional" : "Not today"}</span>{" "}
            {c.run.headline}
          </p>
          {c.run.reasons.length > 0 && (
            <ul className="plain">{c.run.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          )}
          {COACH.rehab.active && c.run.guardrails.length > 0 && (
            <ul className="plain">{c.run.guardrails.map((r) => <li key={r}>{r}</li>)}</ul>
          )}
        </section>

        <section className="card">
          <header className="card-head"><h3>Tomorrow</h3></header>
          <p style={{ margin: "4px 0" }}>{c.tomorrow}</p>
          <p className="why">Recheck each morning. The plan changes with how your body reports in.</p>
        </section>
      </div>

      <h2 className="sect">Health</h2>
      <section className="card">
        <header className="card-head"><h3>What your body is saying</h3><p>Each signal is compared with your own recent normal, not a population average.</p></header>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Signal</th><th>Now</th><th>Your normal</th><th>Status</th><th>What it means</th></tr></thead>
            <tbody>
              {c.signals.map((g) => (
                <tr key={g.key}>
                  <td>{g.label}</td>
                  <td>{g.value}</td>
                  <td>{g.baseline}</td>
                  <td><span className="pill" data-s={g.status}>{STATUS_LABEL[g.status]}</span></td>
                  <td>{g.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="sect">Trends</h2>
      <div className="grid">
        <section className="card wide">
          <header className="card-head"><h3>What has been changing</h3><p>Your recovery and training over recent weeks.</p></header>
          <ul className="insights">
            {c.insights.map((i) => (
              <li key={i.text} data-s={i.tone}>
                <span className="dot" />
                <span>{i.text}</span>
                <span className="pill">{i.tone === "good" ? "Good" : i.tone === "watch" ? "Watch" : "Flag"}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="wide chart-s" data-s={st("load")}>
          <Chart
            title="Daily training load"
            subtitle="Estimated from duration and heart-rate intensity, last 6 weeks"
            data={c.charts.load}
            kind="stack"
            fmt="int"
            series={[
              { key: "Run", label: "Run", color: "var(--run)" },
              { key: "Bike", label: "Bike", color: "var(--bike)" },
              { key: "Swim", label: "Swim", color: "var(--swim)" },
              { key: "Other", label: "Other", color: "var(--s-other)" },
            ]}
          />
        </div>
        <div className="chart-s" data-s={formStatus}><Chart
          title="Fitness, fatigue and form"
          subtitle="Fitness builds slowly, fatigue quickly. Form = fitness − fatigue"
          data={c.charts.fitness}
          fmt="num"
          series={[
            { key: "Fitness", label: "Fitness", color: "var(--elev)" },
            { key: "Fatigue", label: "Fatigue", color: "var(--hr)" },
            { key: "Form", label: "Form", color: "var(--power)" },
          ]}
        />
        </div><div className="chart-s" data-s={st("hrv")}><Chart
          title="HRV vs your baseline"
          subtitle="Overnight HRV (ms) and the average of the previous 28 nights"
          data={c.charts.hrv}
          fmt="int"
          unit=" ms"
          series={[
            { key: "Last night", label: "Overnight HRV", color: "var(--power)" },
            { key: "Your baseline", label: "Your baseline", color: "var(--text-muted)" },
          ]}
        />
        </div>
        <div className="wide chart-s" data-s={st("rhr")}>
          <Chart
            title="Resting HR vs your baseline"
            subtitle="bpm and the average of the previous 28 days. Rising above baseline is an early fatigue flag"
            data={c.charts.rhr}
            fmt="int"
            unit=" bpm"
            height={200}
            series={[
              { key: "Resting HR", label: "Resting HR", color: "var(--hr)" },
              { key: "Your baseline", label: "Your baseline", color: "var(--text-muted)" },
            ]}
          />
        </div>
      </div>

      <details className="how card" style={{ marginTop: 14 }}>
        <summary>How this works</summary>
        <p>
          Every signal is compared with your own rolling normal. HRV uses the average of your last three nights against the previous 60 nights (flag below −0.75 standard deviations, red below −1.5).
          Resting heart rate is compared with your 28-day median (flag at +3 bpm, red at +6). Sleep flags under 7 h (3-night average) and red under 6 h.
          Body battery flags under 60 and red under 40. Load compares the last 7 days with your 4-week average.
        </p>
        <p>
          Watch counts one point, red counts two. Four or more points, or two reds, gives a red day. Two or more points, or one red, gives amber. Otherwise green.
          Load is minutes × (heart-rate intensity squared). Sessions above about 75% of heart-rate reserve for runs, 68% for rides, or 65% for swims count as hard. Short 5–18 km rides on Monday–Thursday count as commutes and never as hard sessions.
        </p>
        <p>
          Running follows injury guardrails in <code>lib/config.ts</code>: a full day between runs or impact sports, a weekly cap that grows at most 10%, and no running unless the day is green. Set <code>rehab.active</code> to false when you are cleared to train normally.
          This is coaching guidance from your data, not medical advice. If something hurts, stop and follow your physio.
        </p>
      </details>
    </>
  );
}

function SessionBlock({ s, showWhy = true }: { s: Session; showWhy?: boolean }) {
  return (
    <>
      <h3 className="title" style={{ color: SPORT_COLOR[s.sport] }}>{s.title}</h3>
      <div className="chips">
        <span className="tag">{s.duration}</span>
        <span className="tag">{s.intensity}</span>
      </div>
      <ol className="steps">
        {s.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      {showWhy && <p className="why">{s.why}</p>}
    </>
  );
}
