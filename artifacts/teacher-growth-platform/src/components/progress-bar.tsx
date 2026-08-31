/**
 * A hours-against-requirement bar.
 *
 * Deliberately shows the numbers as text as well as a bar: a compliance figure
 * that can only be read by eyeballing a bar's width is not a compliance figure,
 * and the bar is invisible to a screen reader without them.
 */
export function ProgressBar({
  completed,
  required,
  state,
}: {
  completed: number;
  required: number;
  state: 'compliant' | 'on_track' | 'at_risk' | 'not_met';
}) {
  const pct = required > 0 ? Math.min(100, (completed / required) * 100) : 0;
  const fill =
    state === 'compliant'
      ? 'bg-foreground'
      : state === 'at_risk' || state === 'not_met'
        ? 'bg-caution-foreground'
        : 'bg-muted-foreground';

  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`${completed} of ${required} hours`}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
