/**
 * A ring showing progress toward a requirement.
 *
 * The figure is written in the middle as text, not conveyed by the arc alone:
 * an arc has no meaning to a screen reader, and a reader who cannot judge angles
 * gets nothing from one either. The ring is decoration over a number, which is
 * the right way round.
 */
export function ComplianceRing({
  completed,
  required,
  label,
  size = 96,
}: {
  completed: number;
  required: number;
  label: string;
  size?: number;
}) {
  const pct = required > 0 ? Math.min(100, (completed / required) * 100) : 0;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}: ${completed} of ${required}, ${Math.round(pct)} per cent`}
        className="shrink-0"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={pct >= 100 ? 'stroke-foreground' : 'stroke-caution-foreground'}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-sm font-semibold"
          aria-hidden="true"
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <div className="text-sm">
        <p className="font-medium">{label}</p>
        <p className="tabular-nums text-muted-foreground">
          {completed} of {required}
        </p>
      </div>
    </div>
  );
}
