import { neon } from "@neondatabase/serverless";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export const RUN = ["running", "trail_running", "treadmill_running", "track_running"];
export const BIKE = ["cycling", "road_biking", "gravel_cycling", "mountain_biking", "virtual_ride", "indoor_cycling", "e_bike_fitness"];
export const SWIM = ["lap_swimming", "open_water_swimming"];

export type Split = {
  x: number; d: number; t: number; pace: number | null; speed: number | null;
  hr: number | null; cad: number | null; pow: number | null; alt: number | null;
};
export type SwimLength = { n: number; t: number; pace: number; strokes: number | null; swolf: number | null; stroke: string | null; anom: boolean };
export type SwimSet = { from: number; to: number; lengths: number; dist: number; t: number; pace: number; strokes: number | null };
export type Lap = {
  n: number; t: number | null; d: number | null; pace: number | null; speed: number | null;
  hr: number | null; maxhr: number | null; pow: number | null; cad: number | null; asc: number | null; desc: number | null;
};
export type Analysis = {
  sport?: string | null;
  step?: number;
  splits?: Split[];
  lengths?: SwimLength[];
  sets?: SwimSet[];
  pool?: number;
  laps?: Lap[];
  power?: { np: number | null; avg: number | null; max: number | null; vi: number | null };
};

export type Activity = {
  id: number;
  day: string; // YYYY-MM-DD (London local)
  time: string; // HH:MM
  type: string;
  name: string;
  s: Record<string, any>; // raw Garmin summary
  sets?: SwimSet[] | null; // swim sets (from FIT analysis), when available
};

export type FullActivity = Activity & { analysis: Analysis | null; note: string };

export type Daily = { day: string; payload: Record<string, any> };

const num = (v: any): number | null => (typeof v === "number" && isFinite(v) ? v : null);
export { num };

export async function getActivities(sinceDays: number, types?: string[]): Promise<Activity[]> {
  const sql = db();
  const list = types ? types.join(",") : "";
  const rows = (await sql`
    select id,
           to_char(start_time at time zone 'Europe/London', 'YYYY-MM-DD') as day,
           to_char(start_time at time zone 'Europe/London', 'HH24:MI') as time,
           activity_type, name, summary, analysis->'sets' as sets
    from activities
    where start_time > now() - make_interval(days => ${sinceDays})
      and (${list} = '' or activity_type = any(string_to_array(${list}, ',')))
    order by start_time asc
  `) as any[];
  return rows.map((r) => ({
    id: Number(r.id),
    day: r.day,
    time: r.time,
    type: r.activity_type ?? "other",
    name: r.name ?? "",
    s: r.summary ?? {},
    sets: r.sets ?? null,
  }));
}

export async function getDaily(kind: string, sinceDays: number): Promise<Daily[]> {
  const sql = db();
  const rows = (await sql`
    select day::text as day, payload
    from daily_metrics
    where kind = ${kind} and day > current_date - ${sinceDays}::int
    order by day asc
  `) as any[];
  return rows.map((r) => ({ day: r.day, payload: r.payload ?? {} }));
}

/**
 * Like getDaily but trims the big Garmin payloads (sleep and HRV carry minute-by-minute arrays)
 * down to the summary parts the accessors use, so long look-backs stay fast.
 */
export async function getDailySlim(kind: string, sinceDays: number): Promise<Daily[]> {
  const sql = db();
  const rows = (await sql`
    select day::text as day,
           case ${kind}::text
             when 'sleep' then jsonb_build_object('dailySleepDTO', payload->'dailySleepDTO')
             when 'hrv' then jsonb_build_object('hrvSummary', payload->'hrvSummary')
             else payload
           end as payload
    from daily_metrics
    where kind = ${kind} and day > current_date - ${sinceDays}::int
    order by day asc
  `) as any[];
  return rows.map((r) => ({ day: r.day, payload: r.payload ?? {} }));
}

export async function lastSync(): Promise<string | null> {
  const sql = db();
  const rows = (await sql`select to_char(max(updated_at) at time zone 'Europe/London', 'DD Mon HH24:MI') as t from (
    select max(updated_at) as updated_at from activities union all select max(updated_at) from daily_metrics) x`) as any[];
  return rows[0]?.t ?? null;
}

/* ---------- derived values ---------- */

export const km = (a: Activity) => (num(a.s.distance) ?? 0) / 1000;
export const durSec = (a: Activity) => num(a.s.duration) ?? 0;
export const paceSecPerKm = (a: Activity) => (km(a) > 0 ? durSec(a) / km(a) : null);
export const swimPaceSecPer100 = (a: Activity) => {
  const d = num(a.s.distance) ?? 0;
  return d > 0 ? durSec(a) / (d / 100) : null;
};
export const speedKmh = (a: Activity) => (num(a.s.averageSpeed) ?? 0) * 3.6 || null;
export const avgHr = (a: Activity) => num(a.s.averageHR);
export const cadence = (a: Activity) =>
  num(a.s.averageRunningCadenceInStepsPerMinute) ?? null;

/** Garmin reports stroke distance in metres on some devices, cm on others. Normalise to cm. */
export function strokeDistCm(a: Activity): number | null {
  const v = num(a.s.avgStrokeDistance) ?? num(a.s.averageStrokeDistance);
  if (v == null) return null;
  return v < 5 ? v * 100 : v;
}

/** Monday of the week containing this YYYY-MM-DD, as YYYY-MM-DD. */
export function weekStart(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Last n week-start dates (oldest first), including the current week. */
export function lastWeeks(n: number): string[] {
  const today = new Date().toISOString().slice(0, 10);
  const cur = new Date(weekStart(today) + "T00:00:00Z");
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(cur);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function avg(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export const round = (v: number | null, dp = 1) =>
  v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp;

/** Daily-metric accessors (defensive: Garmin's JSON shape varies by device). */
export const sleepOf = (p: any) => {
  const d = p?.dailySleepDTO ?? {};
  const h = (s: any) => (num(s) != null ? (s as number) / 3600 : null);
  return {
    total: h(d.sleepTimeSeconds),
    deep: h(d.deepSleepSeconds),
    rem: h(d.remSleepSeconds),
    light: h(d.lightSleepSeconds),
    awake: h(d.awakeSleepSeconds),
    score: num(d.sleepScores?.overall?.value),
  };
};
export const hrvOf = (p: any) => ({
  last: num(p?.hrvSummary?.lastNightAvg),
  weekly: num(p?.hrvSummary?.weeklyAvg),
});
export const statsOf = (p: any) => ({
  steps: num(p?.totalSteps),
  rhr: num(p?.restingHeartRate),
  bbHigh: num(p?.bodyBatteryHighestValue),
  bbLow: num(p?.bodyBatteryLowestValue),
  stress: num(p?.averageStressLevel),
  activeKcal: num(p?.activeKilocalories),
});
export const weightKg = (p: any) => {
  const w = num(p?.weight);
  return w == null ? null : w > 1000 ? w / 1000 : w; // grams -> kg
};

/* ---------- single / multiple activities with full analysis ---------- */

const mapFull = (r: any): FullActivity => ({
  id: Number(r.id),
  day: r.day,
  time: r.time,
  type: r.activity_type ?? "other",
  name: r.name ?? "",
  s: r.summary ?? {},
  analysis: r.analysis ?? null,
  note: r.note ?? "",
});

export async function getActivitiesByIds(ids: number[]): Promise<FullActivity[]> {
  if (!ids.length) return [];
  const sql = db();
  const list = ids.join(",");
  const rows = (await sql`
    select a.id,
           to_char(a.start_time at time zone 'Europe/London', 'YYYY-MM-DD') as day,
           to_char(a.start_time at time zone 'Europe/London', 'HH24:MI') as time,
           a.activity_type, a.name, a.summary, a.analysis, n.note
    from activities a left join activity_notes n on n.activity_id = a.id
    where a.id = any(string_to_array(${list}, ',')::bigint[])
    order by a.start_time asc
  `) as any[];
  return rows.map(mapFull);
}

export async function getActivity(id: number): Promise<FullActivity | null> {
  return (await getActivitiesByIds([id]))[0] ?? null;
}

/* ---------- helpers for the session views ---------- */

/** Mean of a field over the first / middle / last third of a series. */
export function thirds<T>(rows: T[], pick: (r: T) => number | null): (number | null)[] {
  const n = Math.floor(rows.length / 3);
  if (n < 1) return [];
  const parts = [rows.slice(0, n), rows.slice(n, 2 * n), rows.slice(2 * n)];
  return parts.map((p) => avg(p.map(pick)));
}

export type SportKind = "run" | "ride" | "swim" | "other";
export const sportOf = (type: string): SportKind =>
  RUN.includes(type) ? "run" : BIKE.includes(type) ? "ride" : SWIM.includes(type) ? "swim" : "other";
