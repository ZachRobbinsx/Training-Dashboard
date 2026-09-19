export default function Tile({
  label,
  value,
  unit,
  sub,
  color,
  badge,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  color?: string; // CSS colour, e.g. "var(--run)"
  badge?: string;
}) {
  return (
    <div className="tile" style={color ? ({ ["--tile" as string]: color } as React.CSSProperties) : undefined}>
      <div className="k-row">
        <div className="k">{label}</div>
        {badge && <span className="badge">{badge}</span>}
      </div>
      <div className="v">
        {value}
        {unit && value !== "–" && <small>{unit}</small>}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
