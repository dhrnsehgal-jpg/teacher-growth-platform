/**
 * A horizontally scrolling wrapper that a keyboard can actually scroll.
 *
 * A bare `overflow-x-auto` div is reachable with a mouse or a trackpad and by
 * nothing else: it takes no focus, so a keyboard user cannot scroll it, and any
 * table column past the fold is simply unreachable for them. axe flags it as
 * `scrollable-region-focusable`, and it found one of these in the analytics
 * heatmap; there are thirteen. Making it focusable requires giving it a name, which is why the
 * label is not optional.
 */
export function ScrollRegion({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`min-w-0 overflow-x-auto ${className}`.trim()}
    >
      {children}
    </div>
  );
}
