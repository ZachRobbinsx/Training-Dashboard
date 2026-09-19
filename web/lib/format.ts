// Pure formatting helpers (safe to import from server and client components).

export type Fmt = "num" | "num2" | "int" | "pace" | "hours" | "dur";

export function mmss(sec: number): string {
  let m = Math.floor(sec / 60);
  let s = Math.round(sec - m * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtDur(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return "–";
  const h = Math.floor(sec / 3600);
  const rest = sec - h * 3600;
  return h > 0 ? `${h}:${mmss(rest).padStart(5, "0")}` : mmss(sec);
}

export function fmtHours(h: number | null | undefined): string {
  if (h == null || !isFinite(h)) return "–";
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) {
    hh += 1;
    mm = 0;
  }
  return `${hh}h ${String(mm).padStart(2, "0")}m`;
}

export function fmtValue(fmt: Fmt, v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "–";
  switch (fmt) {
    case "int":
      return String(Math.round(v));
    case "num2":
      return (Math.round(v * 100) / 100).toString();
    case "pace":
      return mmss(v);
    case "hours":
      return fmtHours(v);
    case "dur":
      return fmtDur(v);
    default:
      return (Math.round(v * 10) / 10).toString();
  }
}

export function shortDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function longDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
