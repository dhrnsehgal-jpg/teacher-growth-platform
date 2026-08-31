/**
 * How a competency's provenance is described in the interface.
 *
 * This is the Stage 2 counterpart to `src/lib/regulatory/status.ts`. The rule is
 * the same and it is absolute: an item's label must reflect where it actually
 * came from. A school-defined competency is never shown as an NPST or CBSE one,
 * and "informed by NPST" never renders as "NPST requires".
 */

export const SOURCE_FRAMEWORKS = ['npst', 'cbse', 'punjab', 'school', 'other_framework'] as const;
export type SourceFramework = (typeof SOURCE_FRAMEWORKS)[number];

export const SOURCE_ALIGNMENTS = ['aligned', 'derived', 'school_defined'] as const;
export type SourceAlignment = (typeof SOURCE_ALIGNMENTS)[number];

export const FRAMEWORK_LABELS: Readonly<Record<SourceFramework, string>> = {
  npst: 'NPST',
  cbse: 'CBSE',
  punjab: 'Punjab',
  school: 'School',
  other_framework: 'Other framework',
};

export const ALIGNMENT_LABELS: Readonly<Record<SourceAlignment, string>> = {
  aligned: 'Aligned',
  derived: 'Derived',
  school_defined: 'School-defined',
};

/**
 * The one-line provenance statement shown beside a competency.
 *
 * `school_defined` is always attributed to the school regardless of which
 * framework row it sits under — the same trap guarded in the regulatory layer,
 * where a policy written to mirror CBSE guidance is still the school's policy.
 */
export function describeSource(input: {
  framework: SourceFramework;
  alignment: SourceAlignment;
  externalReference?: string | null;
}): string {
  if (input.alignment === 'school_defined') {
    return 'School-defined — no external framework claim';
  }

  const framework = FRAMEWORK_LABELS[input.framework];

  if (input.alignment === 'aligned') {
    return input.externalReference
      ? `Aligned to ${framework} — ${input.externalReference}`
      : `Aligned to ${framework}`;
  }

  return `Derived from ${framework} — reworded or extended by the school`;
}

/**
 * Whether an item may be presented as coming from an external framework at all.
 * `aligned` without a reference is a configuration error; the database rejects
 * it, and this keeps the UI honest if one ever slipped through.
 */
export function canCiteExternally(input: {
  alignment: SourceAlignment;
  externalReference?: string | null;
}): boolean {
  return input.alignment === 'aligned' && Boolean(input.externalReference);
}

/** Visual weight: strongest for a verifiable citation, lightest for school-defined. */
export function sourceTone(alignment: SourceAlignment): 'strong' | 'medium' | 'neutral' {
  switch (alignment) {
    case 'aligned':
      return 'strong';
    case 'derived':
      return 'medium';
    default:
      return 'neutral';
  }
}
