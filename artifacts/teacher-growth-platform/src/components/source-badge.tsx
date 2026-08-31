import {
  ALIGNMENT_LABELS,
  describeSource,
  FRAMEWORK_LABELS,
  sourceTone,
  type SourceAlignment,
  type SourceFramework,
} from '@/lib/competency/source';

const TONE_CLASS: Record<ReturnType<typeof sourceTone>, string> = {
  strong: 'border-transparent bg-foreground text-background',
  medium: 'border-border bg-muted text-foreground',
  neutral: 'border-border bg-transparent text-muted-foreground',
};

/**
 * Provenance badge. Shows the framework and how strong the claim is, with the
 * full citation as the title so it is available without cluttering a list.
 */
export function SourceBadge({
  framework,
  alignment,
  externalReference,
}: {
  framework: SourceFramework;
  alignment: SourceAlignment;
  externalReference?: string | null;
}) {
  const label =
    alignment === 'school_defined'
      ? 'School-defined'
      : `${FRAMEWORK_LABELS[framework]} · ${ALIGNMENT_LABELS[alignment]}`;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[sourceTone(alignment)]}`}
      title={describeSource({ framework, alignment, externalReference })}
    >
      {label}
    </span>
  );
}

/** The full provenance line, for detail pages where there is room for it. */
export function SourceLine({
  framework,
  alignment,
  externalReference,
}: {
  framework: SourceFramework;
  alignment: SourceAlignment;
  externalReference?: string | null;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {describeSource({ framework, alignment, externalReference })}
    </p>
  );
}
