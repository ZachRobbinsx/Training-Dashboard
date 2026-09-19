/* eslint-disable @typescript-eslint/no-explicit-any */
// Rules-based daily coach. Pure functions: give it the stored data, it returns today's readiness,
// a suggested session, and the trends behind it. No network, no randomness, so it is easy to test.
import { BIKE, RUN, SWIM, durSec, hrvOf, km, num, sleepOf, statsOf, weightKg } from "./data";
import type { Activity, Daily } from "./data";
import { COACH, MAX_HR, SWIM_STROKE_TARGET_CM } from "./config";
import { mmss } from "./format";

export type Status = "good" | "watch" | "low" | "unknown";
export type Level = "green" | "amber" | "red";
export type Signal = { key: string; label: string; status: Status; value: string; baseline: string; note: string };
export type Session = {
  title: string;
  sport: "bike" | "swim" | "run" | "rest";
  duration: string;
  intensity: string;
  steps: string[];
  why: string;
};
export type RunAdvice = { allowed: boolean; minutes: number; headline: string; reasons: string[]; guardrails: string[] };
export type Insight = { tone: "good" | "watch" | "info"; text: string };
export type Row = Record<string, string | number | null>;

export type CoachInput = {
  acts: Activity[];
  stats: Daily[];
  sleep: Daily[];
  hrv: Daily[];
  readiness: Daily[];
  weight: Daily[];
  today?: string; // YYYY-MM-DD, defaults to today in London
};

export type CoachResult = {
  today: string;
  readiness: { level: Level; headline: string; summary: string; points: number };
  signals: Signal[];
  garmin: { score: number | null; level: string | null; feedback: string | null } | null;
  session: Session;
  run: RunAdvice;
  tomorrow: string;
  load: { acute7: number | null; chronicWeekly: number | null; acwr: number | null; atl: number; ctl: number; form: number };
  runMinutes: { last7: number; cap: number };
  insights: Insight[];
  notes: string[];
  charts: { load: Row[]; fitness: Row[]; hrv: Row[]; rhr: Row[] };
};

/* ---------------- small helpers ---------------- */

const DAY_MS = 86400000;
export const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
/** b minus a, in whole days. */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY_MS);
/** Mon=1 ... Sun=7 */
export const dowOf = (day: string) => ((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
export const londonToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sd = (xs: number[]): number => {
  const m = mean(xs);
  if (m == null || xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r0 = (v: number) => String(Math.round(v));
const r1 = (v: number) => String(Math.round(v * 10) / 10);
const rnd = (v: number, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;
const signed = (v: number, dp = 0) => {
  const r = rnd(v, dp);
  return r === 0 ? "0" : `${r > 0 ? "+" : "−"}${Math.abs(r)}`;
};
const hrs = (h: number) => `${Math.floor(h)}h ${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, "0")}m`;
/** Heart-rate range for a band of % of max HR. */
const zone = (lo: number, hi: number) => `${Math.round(MAX_HR * lo)}–${Math.round(MAX_HR * hi)} bpm`;
const zoneTop = (hi: number) => Math.round(MAX_HR * hi);

type Pt = { day: string; v: number };
const series = (rows: Daily[], pick: (p: any) => number | null): Pt[] =>
  rows
    .map((r) => ({ day: r.day, v: pick(r.payload) }))
    .filter((x): x is Pt => x.v != null)
    .sort((a, b) => a.day.localeCompare(b.day));

const worst = (a: Status, b: Status): Status => {
  const rank: Record<Status, number> = { unknown: -1, good: 0, watch: 1, low: 2 };
  return rank[a] >= rank[b] ? a : b;
};

/* ---------------- training load ---------------- */

type Enriched = {
  a: Activity;
  sport: "run" | "ride" | "swim" | "other";
  min: number;
  intensity: number;
  load: number;
  hard: boolean;
  commute: boolean;
  impact: boolean;
};

const HARD_IF = { run: 0.75, ride: 0.68, swim: 0.65, other: 0.75 };
const DEFAULT_IF = { run: 0.72, ride: 0.6, swim: 0.6, other: 0.5 };

function enrich(a: Activity, restHr: number): Enriched {
  const sport = RUN.includes(a.type) ? "run" : BIKE.includes(a.type) ? "ride" : SWIM.includes(a.type) ? "swim" : "other";
  const min = durSec(a) / 60;
  const hr = num(a.s.averageHR);
  const intensity = hr ? clamp((hr - restHr) / (MAX_HR - restHr), 0.3, 1) : DEFAULT_IF[sport];
  const load = min * intensity * intensity;
  const dist = km(a);
  const commute =
    sport === "ride" && COACH.commuteDays.includes(dowOf(a.day)) && min >= 15 && min <= 55 && dist >= 5 && dist <= 18;
  const hard = !commute && intensity >= HARD_IF[sport] && min >= 15;
  return { a, sport, min, intensity, load, hard, commute, impact: COACH.impactTypes.includes(a.type) };
}

type DayInfo = {
  day: string;
  load: number;
  run: number; bike: number; swim: number; other: number;
  nonCommuteMin: number;
  hard: number;
  stress: boolean; // a hard or very big non-commute day
  runMin: number;
  jointLoad: boolean; // run or impact sport
  sessions: Enriched[];
};

function buildDays(list: Enriched[], from: string, to: string): Map<string, DayInfo> {
  const map = new Map<string, DayInfo>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    map.set(d, { day: d, load: 0, run: 0, bike: 0, swim: 0, other: 0, nonCommuteMin: 0, hard: 0, stress: false, runMin: 0, jointLoad: false, sessions: [] });
  }
  for (const e of list) {
    const di = map.get(e.a.day);
    if (!di) continue;
    di.sessions.push(e);
    di.load += e.load;
    if (e.sport === "run") di.run += e.load;
    else if (e.sport === "ride") di.bike += e.load;
    else if (e.sport === "swim") di.swim += e.load;
    else di.other += e.load;
    if (!e.commute) di.nonCommuteMin += e.min;
    if (e.hard) di.hard += 1;
    if (e.sport === "run") di.runMin += e.min;
    if (e.sport === "run" || e.impact) di.jointLoad = true;
  }
  for (const di of map.values()) {
    const nonCommuteLoad = di.sessions.filter((s) => !s.commute).reduce((a, s) => a + s.load, 0);
    di.stress = di.hard > 0 || nonCommuteLoad >= 45;
  }
  return map;
}

/* ---------------- signals ---------------- */

function hrvSignal(pts: Pt[], today: string): Signal {
  const s: Signal = { key: "hrv", label: "HRV (overnight)", status: "unknown", value: "–", baseline: "–", note: "" };
  if (pts.length < 14) return { ...s, note: "Needs about two weeks of HRV history to set your normal range." };
  const last = pts[pts.length - 1];
  if (daysBetween(last.day, today) > 1) return { ...s, note: `No HRV recorded since ${last.day}.` };
  const recent = pts.slice(-3).filter((p) => daysBetween(p.day, today) <= 4);
  const ref = pts.slice(0, -3).slice(-60).map((p) => p.v);
  if (ref.length < 10 || !recent.length) return { ...s, note: "Not enough baseline yet." };
  const m = mean(ref)!;
  const spread = Math.max(sd(ref), m * 0.05);
  const a3 = mean(recent.map((p) => p.v))!;
  const z = (a3 - m) / spread;
  const zLast = (last.v - m) / spread;
  let status: Status = z >= -0.75 ? "good" : z >= -1.5 ? "watch" : "low";
  if (status === "good" && zLast <= -2) status = "watch";
  const stale = last.day !== today ? " (last night's reading has not arrived yet)" : "";
  const note =
    status === "good"
      ? `Within your normal range${stale}.`
      : status === "watch"
        ? `Running below your usual range for the last few nights${stale}. Often stress, poor sleep or accumulated training.`
        : `Well below your usual range${stale}. Your nervous system is showing strain.`;
  return { ...s, status, value: `${r0(last.v)} ms (3-night avg ${r0(a3)})`, baseline: `${r0(m)} ± ${r0(spread)} ms`, note };
}

function rhrSignal(pts: Pt[], today: string): Signal {
  const s: Signal = { key: "rhr", label: "Resting heart rate", status: "unknown", value: "–", baseline: "–", note: "" };
  if (pts.length < 10) return { ...s, note: "Needs about ten days of history." };
  const last = pts[pts.length - 1];
  if (daysBetween(last.day, today) > 1) return { ...s, note: `No resting HR since ${last.day}.` };
  const ref = pts.slice(0, -1).slice(-28).map((p) => p.v);
  if (ref.length < 8) return { ...s, note: "Not enough baseline yet." };
  const base = median(ref)!;
  const d = last.v - base;
  const status: Status = d >= 6 ? "low" : d >= 3 ? "watch" : "good";
  const note =
    status === "good"
      ? "In line with your normal."
      : status === "watch"
        ? "A few beats above normal. Can mean fatigue, poor sleep, heat or an oncoming illness."
        : "Clearly elevated. Take it easy and watch for illness.";
  return { ...s, status, value: `${r0(last.v)} bpm (${signed(d)})`, baseline: `${r0(base)} bpm`, note };
}

function sleepSignal(pts: Pt[], today: string): Signal {
  const s: Signal = { key: "sleep", label: "Sleep", status: "unknown", value: "–", baseline: `≥ ${COACH.sleepOkH}h`, note: "" };
  if (!pts.length) return { ...s, note: "No sleep data." };
  const last = pts[pts.length - 1];
  if (daysBetween(last.day, today) > 1) return { ...s, note: `No sleep recorded since ${last.day}.` };
  const a3 = mean(pts.slice(-3).map((p) => p.v))!;
  let status: Status = "good";
  if (last.v < COACH.sleepLowH - 0.5 || a3 < COACH.sleepLowH) status = "low";
  else if (last.v < COACH.sleepOkH - 0.5 || a3 < COACH.sleepOkH) status = "watch";
  const stale = last.day !== today ? " (last night has not arrived yet)" : "";
  const note =
    status === "good"
      ? `Enough sleep to absorb training${stale}.`
      : status === "watch"
        ? `A bit short${stale}. Recovery is slower on under ~7h.`
        : `Short on sleep${stale}. Sleep debt is the fastest way to lose a training block.`;
  return { ...s, status, value: `${hrs(last.v)} (3-night avg ${hrs(a3)})`, note };
}

function bodyBatterySignal(pts: Pt[], today: string): Signal {
  const s: Signal = { key: "bb", label: "Body battery (peak today)", status: "unknown", value: "–", baseline: "≥ 60", note: "" };
  const t = pts.find((p) => p.day === today);
  if (!t) return { ...s, note: "Today's reading is not in yet." };
  const status: Status = t.v >= 60 ? "good" : t.v >= 40 ? "watch" : "low";
  const note = status === "good" ? "You woke with a decent charge." : status === "watch" ? "Only partly recharged overnight." : "Barely recharged overnight.";
  return { ...s, status, value: r0(t.v), note };
}

/* ---------------- main ---------------- */

export function buildCoach(input: CoachInput): CoachResult {
  const today = input.today ?? londonToday();
  const dow = dowOf(today);
  const notes: string[] = [];

  const hrvPts = series(input.hrv, (p) => hrvOf(p).last);
  const rhrPts = series(input.stats, (p) => statsOf(p).rhr);
  const sleepPts = series(input.sleep, (p) => sleepOf(p).total);
  const bbPts = series(input.stats, (p) => statsOf(p).bbHigh);
  const weightPts = series(input.weight, (p) => weightKg(p));

  const restHr = median(rhrPts.slice(-28).map((p) => p.v)) ?? COACH.restHrFallback;

  const winStart = addDays(today, -179);
  const enriched = input.acts.filter((a) => a.day >= winStart && a.day <= today).map((a) => enrich(a, restHr));
  const days = buildDays(enriched, winStart, today);
  const dayList = [...days.values()];
  const dayAt = (offset: number) => days.get(addDays(today, offset));
  const sumLoad = (fromOff: number, toOff: number) => {
    let t = 0;
    for (let o = fromOff; o <= toOff; o++) t += dayAt(o)?.load ?? 0;
    return t;
  };

  /* --- load model: acute:chronic ratio, fitness/fatigue/form --- */
  const acute7 = sumLoad(-6, 0);
  const chronicWeekly = sumLoad(-27, 0) / 4;
  const acwr = chronicWeekly >= 30 ? acute7 / chronicWeekly : null;

  const warm = mean(dayList.slice(0, 28).map((d) => d.load)) ?? 0;
  let atl = warm;
  let ctl = warm;
  const fitness: Row[] = [];
  const loadRows: Row[] = [];
  dayList.forEach((d) => {
    atl += (d.load - atl) * (2 / 8);
    ctl += (d.load - ctl) * (2 / 43);
    if (daysBetween(d.day, today) < 42) {
      fitness.push({ day: d.day, Fitness: rnd(ctl), Fatigue: rnd(atl), Form: rnd(ctl - atl) });
      loadRows.push({ day: d.day, Run: rnd(d.run), Bike: rnd(d.bike), Swim: rnd(d.swim), Other: rnd(d.other) });
    }
  });

  const stressLast3 = [-3, -2, -1].filter((o) => dayAt(o)?.stress).length;
  const hardLast7 = [-6, -5, -4, -3, -2, -1, 0].reduce((a, o) => a + (dayAt(o)?.hard ?? 0), 0);
  const yesterdayStress = !!dayAt(-1)?.stress;
  const swims7 = [-6, -5, -4, -3, -2, -1, 0].reduce((a, o) => a + (dayAt(o)?.sessions.filter((s) => s.sport === "swim").length ?? 0), 0);
  const longRide7 = [-6, -5, -4, -3, -2, -1, 0].some((o) => dayAt(o)?.sessions.some((s) => s.sport === "ride" && !s.commute && s.min >= 90));
  let streak = 0;
  for (let o = -1; o >= -10; o--) {
    if ((dayAt(o)?.nonCommuteMin ?? 0) >= 20) streak++;
    else break;
  }
  const restDays14 = Array.from({ length: 14 }, (_, i) => dayAt(-(i + 1))).filter((d) => d && d.nonCommuteMin < 20).length;

  const loadSignal: Signal = { key: "load", label: "Training load", status: "unknown", value: "–", baseline: "0.8–1.3", note: "" };
  if (acwr != null) {
    let st: Status = acwr > 1.5 ? "low" : acwr > 1.3 ? "watch" : "good";
    st = worst(st, stressLast3 >= 3 ? "low" : stressLast3 === 2 ? "watch" : "good");
    loadSignal.status = st;
    loadSignal.value = `${acwr.toFixed(2)} × your 4-week average`;
    loadSignal.note =
      st === "good"
        ? acwr < 0.8
          ? "Lighter than your recent norm. Room to build if you feel good."
          : "Load is in the sweet spot."
        : `This week is heavy relative to your last month${stressLast3 >= 2 ? `, with ${stressLast3} hard or long days in the last 3` : ""}. Absorb it before adding more.`;
  } else {
    loadSignal.note = "Not enough recent training to compare against.";
  }

  const signals: Signal[] = [
    hrvSignal(hrvPts, today),
    rhrSignal(rhrPts, today),
    sleepSignal(sleepPts, today),
    bodyBatterySignal(bbPts, today),
    loadSignal,
  ];

  /* --- readiness level --- */
  const known = signals.filter((s) => s.status !== "unknown");
  const points = known.reduce((a, s) => a + (s.status === "watch" ? 1 : s.status === "low" ? 2 : 0), 0);
  const lows = known.filter((s) => s.status === "low").length;
  let level: Level;
  let headline: string;
  if (known.length < 2) {
    level = "amber";
    headline = "Not enough fresh data yet. Keep today easy.";
  } else if (points >= 4 || lows >= 2) {
    level = "red";
    headline = "Prioritise recovery today.";
  } else if (points >= 2 || lows === 1) {
    level = "amber";
    headline = "Train, but keep it easy.";
  } else {
    level = "green";
    headline = "You are recovered. Good to train as planned.";
  }
  const flagged = signals.filter((s) => s.status === "watch" || s.status === "low");
  let summary =
    known.length < 2
      ? "Waiting for last night's sleep and HRV to reach the dashboard."
      : flagged.length
        ? `Flags: ${flagged.map((s) => s.label.toLowerCase()).join(", ")}.`
        : "Sleep, HRV, resting heart rate and load all sit in your normal range.";

  const freshDay = [hrvPts, sleepPts].map((p) => p[p.length - 1]?.day).filter(Boolean) as string[];
  if (freshDay.length && freshDay.every((d) => d !== today)) {
    notes.push("Last night's sleep and HRV have not reached the dashboard yet, so this uses the latest data available. Sync your watch, then run the sync workflow or wait for the next 3-hourly one.");
  }

  let forcedEasy = false;
  if (level === "green" && streak >= 5) {
    forcedEasy = true;
    summary += ` You have trained ${streak} days in a row, so today is planned as an easy day.`;
  }

  const gm = input.readiness.length ? input.readiness[input.readiness.length - 1] : null;
  let garmin: CoachResult["garmin"] = null;
  if (gm) {
    const p: any = Array.isArray(gm.payload) ? gm.payload[0] : gm.payload;
    const score = num(p?.score);
    if (score != null) {
      garmin = { score, level: typeof p?.level === "string" ? p.level : null, feedback: typeof p?.feedbackShort === "string" ? p.feedbackShort : null };
    }
  }

  /* --- running decision (injury guardrails) --- */
  const runMin7 = [-6, -5, -4, -3, -2, -1, 0].reduce((a, o) => a + (dayAt(o)?.runMin ?? 0), 0);
  const runPrev7 = [-13, -12, -11, -10, -9, -8, -7].reduce((a, o) => a + (dayAt(o)?.runMin ?? 0), 0);
  const runPrev14 = [-20, -19, -18, -17, -16, -15, -14].reduce((a, o) => a + (dayAt(o)?.runMin ?? 0), 0);
  const cap = Math.max(COACH.rehab.weeklyFloorMin, Math.round((1 + COACH.rehab.weeklyGrowth) * Math.max(runPrev7, runPrev14)));
  const lastJoint = [...dayList].reverse().find((d) => d.jointLoad && d.day <= today);
  const sinceJoint = lastJoint ? daysBetween(lastJoint.day, today) : 99;
  const run = runAdvice({ level, sinceJoint, lastJointDay: lastJoint?.day ?? null, runMin7, cap, forcedEasy });

  /* --- session --- */
  const swimPaces = input.acts
    .filter((a) => a.type === "lap_swimming" && a.day >= addDays(today, -90) && (num(a.s.distance) ?? 0) >= 400)
    .map((a) => {
      const t = num(a.s.movingDuration) ?? durSec(a);
      return t / ((num(a.s.distance) ?? 1) / 100);
    });
  const swimPace = median(swimPaces);
  const session = buildSession({
    level: forcedEasy ? "amber" : level,
    forcedEasy,
    dow,
    isCommuteDay: COACH.commuteDays.includes(dow),
    swims7,
    hardLast7,
    yesterdayStress,
    stressLast3,
    acwr,
    longRide7,
    swimPace,
    flagged,
  });

  /* --- tomorrow --- */
  let tomorrow: string;
  if (level === "red") tomorrow = "Re-check in the morning. If HRV and resting heart rate are back near normal, resume with an easy aerobic session, not intensity.";
  else if (level === "amber" || forcedEasy) tomorrow = "If tomorrow's readiness is green, a steady aerobic session is fine. If not, stay easy another day.";
  else if (/threshold|pace|quality/i.test(session.title)) tomorrow = "Easy or steady only. Do not stack hard days back to back.";
  else if (/long/i.test(session.title)) tomorrow = "Recovery spin or full rest. The long ride will still be in your legs.";
  else tomorrow = "A quality session if readiness holds green.";

  /* --- trends --- */
  const insights = buildInsights({ hrvPts, rhrPts, sleepPts, weightPts, days, today, acute7, chronicWeekly, acwr, hardLast7, restDays14, runMin7, cap });

  /* --- chart series --- */
  const roll = (pts: Pt[], n = 28) =>
    pts
      .filter((p) => daysBetween(p.day, today) < 42)
      .map((p) => {
        const before = pts.filter((q) => q.day < p.day).slice(-n).map((q) => q.v);
        return { day: p.day, v: p.v, base: before.length >= 7 ? rnd(mean(before)!) : null };
      });
  const hrvChart: Row[] = roll(hrvPts).map((r) => ({ day: r.day, "Last night": rnd(r.v), "Your baseline": r.base }));
  const rhrChart: Row[] = roll(rhrPts).map((r) => ({ day: r.day, "Resting HR": rnd(r.v), "Your baseline": r.base }));

  return {
    today,
    readiness: { level, headline, summary, points },
    signals,
    garmin,
    session,
    run,
    tomorrow,
    load: { acute7: rnd(acute7), chronicWeekly: rnd(chronicWeekly), acwr: acwr != null ? rnd(acwr, 2) : null, atl: rnd(atl), ctl: rnd(ctl), form: rnd(ctl - atl) },
    runMinutes: { last7: Math.round(runMin7), cap },
    insights,
    notes,
    charts: { load: loadRows, fitness, hrv: hrvChart, rhr: rhrChart },
  };
}

/* ---------------- running decision ---------------- */

function runAdvice(x: { level: Level; sinceJoint: number; lastJointDay: string | null; runMin7: number; cap: number; forcedEasy: boolean }): RunAdvice {
  const guardrails = [
    "Only if your shins, Achilles and big toe feel calm on a brisk 10-minute walk first.",
    `Flat, soft surface. Conversational pace with heart rate under ${zoneTop(0.7)} bpm. Walk-run is fine, for example 4 min jog / 1 min walk.`,
    "Stop if pain goes above 3/10, or if it is worse the next morning. Then take the following days off running.",
    "These are general rules. Your physio's plan overrides them.",
  ];
  if (!COACH.rehab.active) {
    return { allowed: x.level !== "red", minutes: 0, headline: x.level === "red" ? "No run today." : "Running is not restricted by the injury guardrails.", reasons: [], guardrails: [] };
  }
  const reasons: string[] = [];
  if (x.level === "red") reasons.push("Recovery signals are red.");
  else if (x.level === "amber") reasons.push("Recovery is not fully green. Keep impact out today.");
  else if (x.forcedEasy) reasons.push("Planned easy day after several days in a row. Keep impact out.");
  if (x.sinceJoint < COACH.rehab.minGapDays) {
    reasons.push(
      x.sinceJoint === 0
        ? "You have already had a run or impact session today."
        : `A run or impact session was ${x.sinceJoint} day${x.sinceJoint === 1 ? "" : "s"} ago (${x.lastJointDay}). Leave at least one full day between.`,
    );
  }
  const room = x.cap - x.runMin7;
  if (room < 10) reasons.push(`You are at your weekly running cap (${x.runMin7} of ${x.cap} min in the last 7 days).`);
  if (reasons.length) return { allowed: false, minutes: 0, headline: "No run today.", reasons, guardrails };
  const minutes = Math.max(10, Math.min(COACH.rehab.maxRunMin, Math.floor(room)));
  return { allowed: true, minutes, headline: `A short easy run is on the table: up to ${minutes} min.`, reasons: [`${x.runMin7} of ${x.cap} weekly run minutes used. Last joint-loading day: ${x.lastJointDay ?? "none recently"}.`], guardrails };
}

/* ---------------- session builder ---------------- */

type SessionCtx = {
  level: Level;
  forcedEasy: boolean;
  dow: number;
  isCommuteDay: boolean;
  swims7: number;
  hardLast7: number;
  yesterdayStress: boolean;
  stressLast3: number;
  acwr: number | null;
  longRide7: boolean;
  swimPace: number | null;
  flagged: Signal[];
};

function buildSession(c: SessionCtx): Session {
  const why = c.forcedEasy
    ? "Five or more training days in a row. A planned easy day keeps the next block productive."
    : c.flagged.length
      ? c.flagged.map((s) => `${s.label}: ${s.note}`).join(" ")
      : "All recovery signals are normal and last week's load is manageable.";
  const commute = c.isCommuteDay ? "Commute day: ride in at an easy, conversational effort. It counts toward your load." : null;
  const withCommute = (steps: string[]) => (commute ? [commute, ...steps] : steps);
  const strokeLo = SWIM_STROKE_TARGET_CM[0];
  const strokeHi = SWIM_STROKE_TARGET_CM[1];

  if (c.level === "red") {
    return {
      title: "Recovery day",
      sport: "rest",
      duration: "20–40 min",
      intensity: `Very easy, heart rate under ${zoneTop(0.6)} bpm`,
      steps: withCommute([
        "Easy walk outdoors, or a gentle spin.",
        "10 minutes of mobility for calves, hips and ankles. Only what feels good.",
        "Do your prescribed rehab exercises.",
        "Aim to be in bed 30–60 minutes earlier tonight.",
      ]),
      why,
    };
  }

  if (c.level === "amber") {
    if (c.swims7 < 2) {
      return {
        title: "Easy swim: technique",
        sport: "swim",
        duration: "30–40 min",
        intensity: "Easy (RPE 3–4)",
        steps: withCommute([
          "Warm-up: 200 easy + 4 × 50 drill (fingertip drag or catch-up), 15 s rest.",
          `Main: 6 × 100 easy, 20 s rest. Long, smooth strokes: aim for ${strokeLo}–${strokeHi} cm per stroke.`,
          "Cool-down: 100 easy.",
          "Finish with 10 minutes of mobility and your rehab work.",
        ]),
        why,
      };
    }
    return {
      title: "Easy spin",
      sport: "bike",
      duration: "45–60 min",
      intensity: `Zone 1–2, heart rate under ${zoneTop(0.7)} bpm`,
      steps: withCommute([
        `Spin at 85–95 rpm, heart rate ${zone(0.5, 0.7)}. Should feel too easy.`,
        "No hard efforts, no hills you have to push.",
        "10 minutes of mobility and your rehab work afterwards.",
      ]),
      why,
    };
  }

  // Green
  const weekend = c.dow >= 6;
  const qualityOk = c.hardLast7 < 2 && !c.yesterdayStress && c.stressLast3 < 2 && (c.acwr == null || c.acwr <= 1.3);
  if (weekend && !c.longRide7 && c.stressLast3 < 2 && (c.acwr == null || c.acwr <= 1.3) && !c.yesterdayStress) {
    return {
      title: "Long endurance ride",
      sport: "bike",
      duration: "2–2.5 h",
      intensity: `Zone 2, heart rate ${zone(0.6, 0.75)}`,
      steps: [
        "Steady, conversational effort. Drift above the top of the range only on short climbs.",
        "Eat and drink from the first 30 minutes: 40–60 g carbohydrate per hour.",
        "Cadence 85–95 rpm. Finish feeling like you could do more.",
      ],
      why,
    };
  }
  if (qualityOk) {
    if (c.swims7 <= 1) {
      const p = c.swimPace;
      const target = p ? `${mmss(p - 7)}–${mmss(p - 1)} per 100 m (a touch quicker than your recent average)` : "steady-hard (RPE 7)";
      return {
        title: "Swim: pace & stroke length",
        sport: "swim",
        duration: "45–55 min",
        intensity: "Steady-hard (RPE 7) in the main set",
        steps: withCommute([
          "Warm-up: 300 easy + 4 × 50 drill, 15 s rest.",
          `Main: 8 × 100 at ${target}, 20 s rest. Count strokes per length: keep the count flat across the set and stay at ${strokeLo} cm or more per stroke.`,
          "Then 4 × 50 building fast, 20 s rest.",
          "Cool-down: 200 easy.",
        ]),
        why,
      };
    }
    return {
      title: "Bike: threshold intervals",
      sport: "bike",
      duration: "60–75 min",
      intensity: `Main set steady-hard, heart rate ${zone(0.8, 0.88)} (RPE 7)`,
      steps: withCommute([
        `Warm-up 15 min, building through Zone 2 (${zone(0.6, 0.7)}).`,
        "Main: 4 × 6 min steady-hard, 3 min easy spinning between.",
        "Cool-down: 10 min easy.",
        "If the last interval feels hard to finish, stop the set there.",
      ]),
      why,
    };
  }
  if (c.swims7 < 2) {
    return {
      title: "Swim: aerobic endurance",
      sport: "swim",
      duration: "40–50 min",
      intensity: "Steady (RPE 5)",
      steps: withCommute([
        "Warm-up: 300 easy + 4 × 50 drill.",
        "Main: 5 × 200 steady, 20 s rest. Smooth and long, same stroke count each length.",
        "4 × 50 technique drill, then 200 easy.",
      ]),
      why,
    };
  }
  return {
    title: "Steady aerobic ride",
    sport: "bike",
    duration: "60–90 min",
    intensity: `Zone 2, heart rate ${zone(0.6, 0.72)}`,
    steps: withCommute([
      "Even effort you could talk through. No surges.",
      "Cadence 85–95 rpm.",
      "A steady day now sets up quality later in the week.",
    ]),
    why,
  };
}

/* ---------------- trends ---------------- */

function buildInsights(x: {
  hrvPts: Pt[]; rhrPts: Pt[]; sleepPts: Pt[]; weightPts: Pt[];
  days: Map<string, DayInfo>; today: string;
  acute7: number; chronicWeekly: number; acwr: number | null; hardLast7: number; restDays14: number; runMin7: number; cap: number;
}): Insight[] {
  const out: Insight[] = [];
  const { today } = x;

  // HRV: last 7 nights vs the 28 before
  const h7 = x.hrvPts.filter((p) => daysBetween(p.day, today) < 7).map((p) => p.v);
  const hPrev = x.hrvPts.filter((p) => daysBetween(p.day, today) >= 7 && daysBetween(p.day, today) < 35).map((p) => p.v);
  if (h7.length >= 4 && hPrev.length >= 10) {
    const pct = (mean(h7)! / mean(hPrev)! - 1) * 100;
    out.push({
      tone: pct <= -8 ? "watch" : pct >= 5 ? "good" : "info",
      text: `HRV: 7-night average ${r0(mean(h7)!)} ms, ${signed(pct)}% versus the previous four weeks. ${pct <= -8 ? "A sustained dip like this usually means you need more recovery." : pct >= 5 ? "Trending up: you are adapting well." : "Steady."}`,
    });
  }

  // Resting HR
  const r7 = x.rhrPts.filter((p) => daysBetween(p.day, today) < 7).map((p) => p.v);
  const rPrev = x.rhrPts.filter((p) => daysBetween(p.day, today) >= 7 && daysBetween(p.day, today) < 35).map((p) => p.v);
  if (r7.length >= 4 && rPrev.length >= 10) {
    const d = mean(r7)! - mean(rPrev)!;
    out.push({
      tone: d >= 3 ? "watch" : d <= -2 ? "good" : "info",
      text: `Resting HR: 7-day average ${r0(mean(r7)!)} bpm (${signed(d, 1)} versus the previous four weeks). ${d >= 3 ? "Creeping up is an early fatigue or illness flag." : d <= -2 ? "Coming down: fitness is improving." : "Stable."}`,
    });
  }

  // Sleep
  const s7 = x.sleepPts.filter((p) => daysBetween(p.day, today) < 7).map((p) => p.v);
  const s14 = x.sleepPts.filter((p) => daysBetween(p.day, today) < 14);
  if (s7.length >= 4) {
    const short = s14.filter((p) => p.v < 6.5).length;
    out.push({
      tone: mean(s7)! < COACH.sleepOkH - 0.5 ? "watch" : "info",
      text: `Sleep: ${hrs(mean(s7)!)} average over the last week. ${short} of the last ${s14.length} nights were under 6.5 h.`,
    });
  }

  // Load ramp
  if (x.acwr != null) {
    out.push({
      tone: x.acwr > 1.3 ? "watch" : "info",
      text: `Load: this week is ${x.acwr.toFixed(2)} × your 4-week average. ${x.acwr > 1.5 ? "That is a steep jump. Injury risk climbs, so back off." : x.acwr > 1.3 ? "On the high side. Fine for a week, not for several." : x.acwr < 0.8 ? "Lighter than usual: an easy week, or room to build." : "In the productive range."}`,
    });
  }

  // How your body responds to hard days
  const hrvBase = mean(x.hrvPts.slice(-90).map((p) => p.v));
  if (hrvBase) {
    const byDay = new Map(x.hrvPts.map((p) => [p.day, p.v]));
    const after: { stress: number[]; rest: number[] } = { stress: [], rest: [] };
    for (const d of x.days.values()) {
      const next = addDays(d.day, 1);
      if (next > today || daysBetween(d.day, today) > 120) continue;
      const v = byDay.get(next);
      if (v == null) continue;
      if (d.stress) after.stress.push((v / hrvBase - 1) * 100);
      else if (d.nonCommuteMin < 20) after.rest.push((v / hrvBase - 1) * 100);
    }
    if (after.stress.length >= 4 && after.rest.length >= 4) {
      const a = mean(after.stress)!;
      const b = mean(after.rest)!;
      out.push({
        tone: "info",
        text: `How you respond: the morning after a hard or long day your HRV averages ${signed(a)}% versus your baseline (${after.stress.length} days), against ${signed(b)}% after rest days (${after.rest.length} days).${a - b < -10 ? " You take a real hit from big days, so space them out." : a - b > -3 ? " Big days barely dent your HRV. You are recovering well." : ""}`,
      });
    }
  }

  // Weight
  const w = x.weightPts.filter((p) => daysBetween(p.day, today) < 28);
  if (w.length >= 5) {
    const a = mean(w.slice(0, Math.min(3, w.length)).map((p) => p.v))!;
    const b = mean(w.slice(-3).map((p) => p.v))!;
    out.push({ tone: "info", text: `Weight: ${r1(b)} kg, ${signed(b - a, 1)} kg over the last four weeks.` });
  }

  // Hard sessions & rest
  out.push({
    tone: x.hardLast7 >= 3 || x.restDays14 <= 1 ? "watch" : "info",
    text: `Structure: ${x.hardLast7} hard session${x.hardLast7 === 1 ? "" : "s"} in the last 7 days and ${x.restDays14} full rest day${x.restDays14 === 1 ? "" : "s"} in the last 14 (commutes not counted).`,
  });

  // Running exposure
  out.push({ tone: x.runMin7 > x.cap ? "watch" : "info", text: `Running: ${Math.round(x.runMin7)} of ${x.cap} allowed minutes used in the last 7 days.` });

  return out;
}
