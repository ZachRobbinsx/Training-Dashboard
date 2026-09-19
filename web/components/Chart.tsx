"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtValue, shortDate, type Fmt } from "@/lib/format";

export type Series = { key: string; label: string; color?: string };
type Row = Record<string, string | number | null>;
export type Ref = { y: number; label: string; color?: string };

type Props = {
  title: string;
  subtitle?: string;
  data: Row[];
  xKey?: string;
  xUnit?: string; // e.g. " km" -> tooltip shows "km 5"
  series: Series[];
  kind?: "line" | "area" | "bar" | "stack";
  fmt?: Fmt;
  unit?: string;
  invert?: boolean; // lower is better (pace): flips the axis so "up" = faster
  domain?: [number | "auto", number | "auto"];
  band?: { y1: number; y2: number; label: string };
  refs?: Ref[];
  color?: string; // colour for a single series
  height?: number;
};

const slot = (i: number) => `var(--s${(i % 6) + 1})`;
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

export default function Chart({
  title,
  subtitle,
  data,
  xKey = "day",
  xUnit = "",
  series,
  kind = "line",
  fmt = "num",
  unit = "",
  invert = false,
  domain,
  band,
  refs = [],
  color,
  height = 220,
}: Props) {
  const gid = useId().replace(/:/g, "");
  const xLabel = (v: unknown) => (isDate(v) ? shortDate(String(v)) : String(v));
  const xTip = (v: unknown) => (isDate(v) ? shortDate(String(v)) : `${xUnit.trim()} ${v}`.trim());
  const colors = series.map((s, i) => s.color ?? (series.length === 1 && color ? color : slot(i)));
  const empty = data.length === 0 || series.every((s) => data.every((d) => d[s.key] == null));
  const tick = { fill: "var(--text-muted)", fontSize: 11 };
  const isBar = kind === "bar" || kind === "stack";

  const yAxis = (
    <YAxis
      tick={tick}
      tickLine={false}
      axisLine={false}
      width={48}
      reversed={invert}
      allowDecimals={fmt !== "int"}
      domain={domain ?? (isBar || kind === "area" ? [0, "auto"] : ["auto", "auto"])}
      tickFormatter={(v) => (fmt === "hours" ? `${Math.round((v as number) * 10) / 10}h` : fmtValue(fmt, v as number))}
    />
  );
  const xAxis = (
    <XAxis
      dataKey={xKey}
      tick={tick}
      tickLine={false}
      axisLine={{ stroke: "var(--grid)" }}
      tickFormatter={xLabel}
      minTickGap={24}
    />
  );
  const grid = <CartesianGrid vertical={false} stroke="var(--grid)" />;
  const tooltip = (
    <Tooltip
      cursor={isBar ? { fill: "var(--grid)", opacity: 0.5 } : { stroke: "var(--text-muted)", strokeDasharray: "3 3" }}
      content={<Tip fmt={fmt} unit={unit} xTip={xTip} />}
    />
  );
  const legend =
    series.length > 1 ? (
      <Legend
        verticalAlign="top"
        align="left"
        iconType="circle"
        iconSize={8}
        wrapperStyle={{ paddingBottom: 8, fontSize: 12 }}
        formatter={(v) => <span style={{ color: "var(--text-secondary)" }}>{v}</span>}
      />
    ) : null;
  const bandEl = band ? (
    <ReferenceArea
      y1={band.y1}
      y2={band.y2}
      ifOverflow="extendDomain"
      fill="var(--target)"
      fillOpacity={0.14}
      stroke="none"
      label={{ value: band.label, position: "insideTopRight", fill: "var(--text-secondary)", fontSize: 11 }}
    />
  ) : null;
  const refEls = refs.map((r) => (
    <ReferenceLine
      key={r.label}
      y={r.y}
      ifOverflow="extendDomain"
      stroke={r.color ?? "var(--text-muted)"}
      strokeDasharray="4 4"
      label={{ value: r.label, position: "insideTopRight", fill: r.color ?? "var(--text-secondary)", fontSize: 10 }}
    />
  ));
  const margin = { top: 8, right: 8, bottom: 0, left: 0 };

  return (
    <section className="card">
      <header className="card-head">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </header>
      {empty ? (
        <div className="empty" style={{ height }}>No data yet</div>
      ) : (
        <div style={{ width: "100%", height }}>
          <ResponsiveContainer>
            {kind === "line" ? (
              <LineChart data={data} margin={margin}>
                {grid}{xAxis}{yAxis}{bandEl}{refEls}{tooltip}{legend}
                {series.map((s, i) => (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stroke={colors[i]}
                    strokeWidth={2}
                    dot={data.length <= 40 ? { r: 3, fill: colors[i], stroke: "var(--bg)", strokeWidth: 2 } : false}
                    activeDot={{ r: 5, fill: colors[i], stroke: "var(--bg)", strokeWidth: 2 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            ) : kind === "area" ? (
              <AreaChart data={data} margin={margin}>
                <defs>
                  {series.map((s, i) => (
                    <linearGradient key={s.key} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colors[i]} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={colors[i]} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                {grid}{xAxis}{yAxis}{refEls}{tooltip}{legend}
                {series.map((s, i) => (
                  <Area
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    type="monotone"
                    stroke={colors[i]}
                    strokeWidth={2}
                    fill={`url(#${gid}-${i})`}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            ) : (
              <BarChart data={data} margin={margin}>
                {grid}{xAxis}{yAxis}{tooltip}{legend}
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={colors[i]}
                    stackId={kind === "stack" ? "a" : undefined}
                    maxBarSize={28}
                    radius={kind === "stack" ? 0 : [4, 4, 0, 0]}
                    stroke="var(--bg)"
                    strokeWidth={kind === "stack" ? 2 : 0}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      {!empty && (
        <details className="table-view">
          <summary>View as table</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{xKey === "day" ? "Date" : xUnit.trim() || xKey}</th>
                  {series.map((s) => <th key={s.key}>{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.map((d, i) => (
                  <tr key={i}>
                    <td>{xLabel(d[xKey])}</td>
                    {series.map((s) => (
                      <td key={s.key}>
                        {fmtValue(fmt, d[s.key] as number | null)}
                        {d[s.key] != null ? unit : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Tip({ active, payload, label, fmt, unit, xTip }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      <div className="tip-title">{xTip(label)}</div>
      {payload.map((p: any) =>
        p.value == null ? null : (
          <div key={p.dataKey} className="tip-row">
            <span className="dot" style={{ background: p.color ?? p.fill }} />
            <span className="tip-name">{p.name}</span>
            <span className="tip-val">{fmtValue(fmt, p.value)}{unit}</span>
          </div>
        ),
      )}
    </div>
  );
}
