import { createClient } from '@/lib/supabase/server';

/**
 * The Professional Growth Assistant.
 *
 * Everything it produces is composed from records the platform already holds:
 * gap factors with their own stated reasons, recommendation scores with their
 * own "why this course", CPD progress against a configured requirement. That is
 * not a fallback for a missing model — it is the design. The platform already
 * knows why it reached its conclusions, so an explanation of them should be
 * derived rather than generated.
 *
 * A configured model may ENRICH that output. It may not replace it, and it is
 * off until somebody records the data-processing agreement, the privacy review,
 * the region and the controls — see `ai.configuration`.
 *
 * Nothing here writes to a competency level, an appraisal, an increment or a
 * regulatory requirement. Suggestions land in `ai.suggestion`, which no engine
 * reads.
 */

export type SuggestionKind =
  | 'explain_competency_gap'
  | 'explain_assessment_feedback'
  | 'recommend_development_goal'
  | 'explain_cpd_match'
  | 'draft_development_plan'
  | 'summarise_reflections'
  | 'summarise_evidence'
  | 'observation_themes'
  | 'post_cpd_reflection_support'
  | 'explain_progression_requirements'
  | 'explain_cpd_compliance_deficit';

export interface SuggestionInput {
  /** What kind of record this came from, for display. */
  source: string;
  /** A human-readable description of the record. */
  detail: string;
  /** Set only when the input is a verified regulatory requirement. */
  requirement_key?: string;
}

export interface Composed {
  headline: string;
  body: string;
  inputs: SuggestionInput[];
}

export const ADVISORY_LABEL = 'AI-assisted recommendation — professional judgement required.';

export const KIND_LABEL: Record<SuggestionKind, string> = {
  explain_competency_gap: 'Explain this competency gap',
  explain_assessment_feedback: 'Explain my assessment feedback',
  recommend_development_goal: 'Suggest a development goal',
  explain_cpd_match: 'Why does this CPD match my gap?',
  draft_development_plan: 'Draft a development plan',
  summarise_reflections: 'Summarise my reflections',
  summarise_evidence: 'Summarise my evidence',
  observation_themes: 'Themes in my observation feedback',
  post_cpd_reflection_support: 'Help me reflect after CPD',
  explain_progression_requirements: 'Explain progression requirements',
  explain_cpd_compliance_deficit: 'Explain my CPD shortfall',
};

/** Whether a configured external model may be used at all. */
export async function externalAssistanceEnabled(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('ai')
    .from('configuration')
    .select('external_assistance_enabled')
    .maybeSingle();
  return (
    (data as unknown as { external_assistance_enabled: boolean } | null)
      ?.external_assistance_enabled === true
  );
}

function joinSentences(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p && p.trim().length > 0).join(' ');
}

// ---------------------------------------------------------------------------
// Deterministic composers
// ---------------------------------------------------------------------------

async function composeGapExplanation(
  teacherProfileId: string,
  yearId: string,
  competencyKey?: string,
): Promise<Composed | null> {
  const supabase = await createClient();
  let query = supabase
    .schema('growth')
    .from('gap_detail')
    .select('*')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .gt('gap_size', 0)
    .order('priority_score', { ascending: false });
  if (competencyKey) query = query.eq('competency_key', competencyKey);

  const { data } = await query.limit(1);
  const gap = (data ?? [])[0] as unknown as
    | {
        competency_name: string;
        competency_key: string;
        gap_size: number;
        priority_score: number;
        priority_band_key: string;
        expected_level_name: string;
        verified_level_name: string;
        factors: { factor: string; points: number; why: string }[];
      }
    | undefined;
  if (!gap) return null;

  const factors = [...(gap.factors ?? [])].sort((a, b) => b.points - a.points);
  const top = factors.slice(0, 3);

  return {
    headline: `${gap.competency_name}: ${gap.verified_level_name} against an expected ${gap.expected_level_name}`,
    body: joinSentences([
      `This is a gap of ${gap.gap_size} level${gap.gap_size === 1 ? '' : 's'}, scored ${gap.priority_score} out of 100 and banded ${gap.priority_band_key.replace(/_/g, ' ')}.`,
      top.length > 0
        ? `The largest contributors are: ${top.map((f) => `${f.factor.toLowerCase()} (${f.points} points) — ${f.why}`).join(' ')}`
        : null,
      'The score is arithmetic, not a judgement about you: it exists to order development, and every point above is attributable to a stored record.',
    ]),
    inputs: [
      {
        source: 'Verified competency level',
        detail: `${gap.competency_name} verified at ${gap.verified_level_name}, expected ${gap.expected_level_name}`,
      },
      ...factors.map((f) => ({
        source: 'Gap engine factor',
        detail: `${f.factor}: ${f.points} points — ${f.why}`,
      })),
    ],
  };
}

async function composeCpdMatch(teacherProfileId: string): Promise<Composed | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('cpd')
    .from('recommendation_detail')
    .select('*')
    .eq('teacher_profile_id', teacherProfileId)
    .order('score', { ascending: false })
    .limit(1);

  const rec = (data ?? [])[0] as unknown as
    | {
        title: string;
        competency_name: string;
        score: number;
        provider_name: string;
        cpd_hours: number | null;
        reasons: { factor: string; points: number; why: string }[];
      }
    | undefined;
  if (!rec) return null;

  const reasons = [...(rec.reasons ?? [])].sort((a, b) => b.points - a.points);

  return {
    headline: `${rec.title} is the strongest match for ${rec.competency_name}`,
    body: joinSentences([
      `It scored ${rec.score} against your gap in ${rec.competency_name}.`,
      reasons.length > 0
        ? `The ranking is deterministic and every point is attributable: ${reasons.map((r) => `${r.factor.toLowerCase()} (${r.points}) — ${r.why}`).join('; ')}.`
        : null,
      'No model produced this ranking. Choosing whether the course is right for you remains yours and your appraiser’s decision.',
    ]),
    inputs: [
      {
        source: 'CPD recommendation',
        detail: `${rec.title} from ${rec.provider_name}, score ${rec.score}${rec.cpd_hours ? `, ${Number(rec.cpd_hours)} CPD hours` : ''}`,
      },
      ...reasons.map((r) => ({
        source: 'Recommendation factor',
        detail: `${r.factor}: ${r.points} points — ${r.why}`,
      })),
    ],
  };
}

async function composeCpdDeficit(
  teacherProfileId: string,
  yearId: string,
): Promise<Composed | null> {
  const supabase = await createClient();
  const { data } = await supabase.schema('compliance').rpc('cpd_progress', {
    p_teacher_profile_id: teacherProfileId,
    p_academic_year_id: yearId,
  });
  const rows = (data ?? []) as {
    dimension: string;
    item_key: string;
    label: string;
    required_hours: number;
    completed_hours: number;
    remaining_hours: number;
    state: string;
  }[];
  if (rows.length === 0) return null;

  const total = rows.find((r) => r.dimension === 'total');
  if (!total) return null;
  const short = rows.filter((r) => r.dimension !== 'total' && r.remaining_hours > 0);

  // The requirement itself is cited so the regulatory guard can verify it.
  const { data: req } = await supabase
    .schema('regulatory')
    .from('requirement')
    .select('requirement_key, title, verification_status')
    .eq('requirement_key', 'cbse.cpd.annual_hours')
    .maybeSingle();
  const requirement = req as unknown as {
    requirement_key: string;
    title: string;
    verification_status: string;
  } | null;

  return {
    headline: `${Number(total.completed_hours)} of ${Number(total.required_hours)} CPD hours credited`,
    body: joinSentences([
      short.length === 0
        ? 'Every part of the requirement is met.'
        : `The shortfall sits in: ${short.map((s) => `${s.label} (${Number(s.remaining_hours)} hours short)`).join(', ')}.`,
      'Hours count only once a reviewer has verified the record, so anything still awaiting review is not included above.',
      'Reaching the annual total is not sufficient on its own — the domain and source splits each have to be met too.',
    ]),
    inputs: [
      {
        source: 'CPD ledger',
        detail: `${Number(total.completed_hours)} of ${Number(total.required_hours)} hours credited, ${Number(total.remaining_hours)} remaining`,
      },
      ...short.map((s) => ({
        source: 'CPD requirement split',
        detail: `${s.label}: ${Number(s.completed_hours)} of ${Number(s.required_hours)}`,
      })),
      ...(requirement && requirement.verification_status === 'verified'
        ? [
            {
              source: 'Verified regulatory requirement',
              detail: requirement.title,
              requirement_key: requirement.requirement_key,
            },
          ]
        : []),
    ],
  };
}

async function composeEvidenceSummary(
  teacherProfileId: string,
  yearId: string,
): Promise<Composed | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('evidence')
    .from('evidence')
    .select('id, title, status, strength, occurred_on, evidence_type:evidence_type_id(name)')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId);

  const rows = (data ?? []) as unknown as {
    id: string;
    title: string;
    status: string;
    strength: string | null;
    occurred_on: string | null;
    evidence_type: { name: string } | null;
  }[];
  if (rows.length === 0) return null;

  const verified = rows.filter((r) => r.status === 'verified');
  const byType = new Map<string, number>();
  for (const r of rows) {
    const t = r.evidence_type?.name ?? 'Unclassified';
    byType.set(t, (byType.get(t) ?? 0) + 1);
  }

  return {
    headline: `${rows.length} piece${rows.length === 1 ? '' : 's'} of evidence this year, ${verified.length} verified`,
    body: joinSentences([
      `By type: ${[...byType.entries()].map(([t, n]) => `${t} (${n})`).join(', ')}.`,
      verified.length < rows.length
        ? `${rows.length - verified.length} item${rows.length - verified.length === 1 ? ' is' : 's are'} not yet verified, so ${rows.length - verified.length === 1 ? 'it does' : 'they do'} not yet support a competency judgement.`
        : 'All of it has been verified.',
      'A summary is not an assessment. What this evidence demonstrates is for your appraiser to judge.',
    ]),
    inputs: rows.map((r) => ({
      source: 'Evidence record',
      detail: `${r.title} (${r.evidence_type?.name ?? 'unclassified'}, ${r.status}${r.strength ? `, ${r.strength}` : ''})`,
    })),
  };
}

async function composeObservationThemes(
  teacherProfileId: string,
  yearId: string,
): Promise<Composed | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('assessment')
    .from('observation')
    .select('id, observed_on, focus, narrative')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .order('observed_on', { ascending: false });

  const rows = (data ?? []) as unknown as {
    id: string;
    observed_on: string;
    focus: string | null;
    narrative: string;
  }[];
  if (rows.length === 0) return null;

  const foci = [...new Set(rows.map((r) => r.focus).filter(Boolean))] as string[];

  return {
    headline: `${rows.length} classroom observation${rows.length === 1 ? '' : 's'} recorded this year`,
    body: joinSentences([
      foci.length > 0 ? `Observed with a focus on: ${foci.join(', ')}.` : null,
      rows.length === 1
        ? 'With a single observation there is no pattern to report — one lesson is a snapshot, not a theme.'
        : 'Themes across several observations are worth discussing with your appraiser; the narratives are shown below in full rather than paraphrased, so nothing is lost in summary.',
    ]),
    inputs: rows.map((r) => ({
      source: 'Classroom observation',
      detail: `${r.observed_on}${r.focus ? ` — ${r.focus}` : ''}: ${r.narrative}`,
    })),
  };
}

// ---------------------------------------------------------------------------

/**
 * Composes a suggestion from stored data.
 *
 * Returns null when there is nothing to explain. That is a real answer — better
 * than manufacturing advice from an empty record, which is how an assistant
 * starts inventing things.
 */
async function composeGoalSuggestion(
  teacherProfileId: string,
  yearId: string,
  competencyKey?: string,
): Promise<Composed | null> {
  const supabase = await createClient();
  let query = supabase
    .schema('growth')
    .from('gap_detail')
    .select('competency_name, competency_key, gap_size, expected_level_name, verified_level_name')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .gt('gap_size', 0)
    .order('priority_score', { ascending: false });
  if (competencyKey) query = query.eq('competency_key', competencyKey);

  const { data } = await query.limit(1);
  const gap = (data ?? [])[0] as unknown as
    | {
        competency_name: string;
        competency_key: string;
        gap_size: number;
        expected_level_name: string;
        verified_level_name: string;
      }
    | undefined;
  if (!gap) return null;

  const { data: evidenceTypes } = await supabase
    .schema('evidence')
    .from('evidence_type')
    .select('name')
    .limit(4);
  const types = ((evidenceTypes ?? []) as unknown as { name: string }[]).map((e) => e.name);

  // A goal, not a paragraph about a goal: a title, a success measure and what
  // would evidence it — the same three fields the goal form asks for, so it can
  // be lifted straight across or argued with field by field.
  return {
    headline: `A draft goal for ${gap.competency_name}`,
    body: joinSentences([
      `Title: move ${gap.competency_name} from ${gap.verified_level_name} to ${gap.expected_level_name}.`,
      `Success measure: a reassessment verifies ${gap.expected_level_name}, supported by evidence that the change reached your teaching — not by having attended anything.`,
      types.length > 0 ? `Evidence the school recognises includes: ${types.join(', ')}.` : null,
      'This is a draft in your own words to edit, not a goal that has been set for you. Goals are yours to write and yours to agree with your reviewer; the platform has only filled in what it already knows about the gap.',
    ]),
    inputs: [
      {
        source: 'Identified gap',
        detail: `${gap.competency_name}: ${gap.verified_level_name} against an expected ${gap.expected_level_name}`,
      },
      ...types.map((t) => ({ source: 'Recognised evidence type', detail: t })),
    ],
  };
}

async function composeFeedbackExplanation(
  teacherProfileId: string,
  yearId: string,
): Promise<Composed | null> {
  const supabase = await createClient();
  const [observations, evidence, impacts] = await Promise.all([
    supabase
      .schema('assessment')
      .from('rating_detail')
      .select('competency_name, level_name, source, rationale, rated_by_name, rated_at')
      .eq('teacher_profile_id', teacherProfileId)
      .not('rationale', 'is', null)
      .order('rated_at', { ascending: false })
      .limit(6),
    supabase
      .schema('evidence')
      .from('evidence')
      .select('title, status, strength, review_note, reviewed_at')
      .eq('teacher_profile_id', teacherProfileId)
      .eq('academic_year_id', yearId)
      .not('review_note', 'is', null)
      .order('reviewed_at', { ascending: false })
      .limit(4),
    supabase
      .schema('growth')
      .from('plan_item_detail')
      .select('competency_name, impact_verification_note, impact_verified_by_name')
      .eq('teacher_profile_id', teacherProfileId)
      .eq('academic_year_id', yearId)
      .not('impact_verification_note', 'is', null)
      .limit(4),
  ]);

  const ratings = (observations.data ?? []) as unknown as {
    competency_name: string;
    level_name: string;
    source: string;
    rationale: string;
    rated_by_name: string | null;
    rated_at: string;
  }[];
  const reviews = (evidence.data ?? []) as unknown as {
    title: string;
    status: string;
    strength: string | null;
    review_note: string;
  }[];
  const verifications = (impacts.data ?? []) as unknown as {
    competency_name: string;
    impact_verification_note: string;
    impact_verified_by_name: string | null;
  }[];

  if (ratings.length === 0 && reviews.length === 0 && verifications.length === 0) return null;

  // Feedback is restated and located, never paraphrased. A summary that
  // rewords a colleague's professional judgement changes it, and the teacher
  // needs to argue with what was actually written.
  const supervisor = ratings.filter((r) => r.source !== 'self');
  const own = ratings.filter((r) => r.source === 'self');

  return {
    headline: `Your feedback this year: ${supervisor.length} from a colleague, ${reviews.length} on evidence, ${verifications.length} verifying impact`,
    body: joinSentences([
      supervisor.length > 0
        ? `On ${supervisor[0]!.competency_name}, ${supervisor[0]!.rated_by_name ?? 'a colleague'} placed you at ${supervisor[0]!.level_name} and wrote: "${supervisor[0]!.rationale}"`
        : 'No colleague has recorded a rationale against a rating yet.',
      own.length > 0 && supervisor.length > 0
        ? `Your own assessment of the same period is recorded separately and was not merged into theirs — where the two differ, that difference is the conversation worth having.`
        : null,
      reviews.length > 0
        ? `On evidence, the most recent decision was "${reviews[0]!.title}" — ${reviews[0]!.status.replace(/_/g, ' ')}${reviews[0]!.strength ? `, judged ${reviews[0]!.strength}` : ''}: "${reviews[0]!.review_note}"`
        : null,
      verifications.length > 0
        ? `Impact was verified on ${verifications[0]!.competency_name} by ${verifications[0]!.impact_verified_by_name ?? 'your reviewer'}: "${verifications[0]!.impact_verification_note}"`
        : null,
      'Each of these is quoted rather than summarised, so nothing has been softened or reinterpreted on the way to you.',
    ]),
    inputs: [
      ...ratings.map((r) => ({
        source: r.source === 'self' ? 'Your own assessment' : 'Colleague assessment',
        detail: `${r.competency_name} at ${r.level_name}${r.rated_by_name ? ` by ${r.rated_by_name}` : ''}`,
      })),
      ...reviews.map((r) => ({
        source: 'Evidence decision',
        detail: `${r.title} — ${r.status.replace(/_/g, ' ')}`,
      })),
      ...verifications.map((v) => ({
        source: 'Impact verification',
        detail: `${v.competency_name}, verified by ${v.impact_verified_by_name ?? 'your reviewer'}`,
      })),
    ],
  };
}

async function composeDraftPlan(
  teacherProfileId: string,
  yearId: string,
): Promise<Composed | null> {
  const supabase = await createClient();
  const [gapsResult, recsResult] = await Promise.all([
    supabase
      .schema('growth')
      .from('gap_detail')
      .select('competency_name, competency_key, gap_size, priority_score, priority_band_key')
      .eq('teacher_profile_id', teacherProfileId)
      .eq('academic_year_id', yearId)
      .gt('gap_size', 0)
      .order('priority_score', { ascending: false })
      .limit(3),
    supabase
      .schema('growth')
      .from('recommendation')
      .select('competency_key, title, provider_name, cpd_hours, score')
      .eq('teacher_profile_id', teacherProfileId)
      .order('score', { ascending: false })
      .limit(12),
  ]);

  const gaps = (gapsResult.data ?? []) as unknown as {
    competency_name: string;
    competency_key: string;
    gap_size: number;
    priority_score: number;
    priority_band_key: string;
  }[];
  if (gaps.length === 0) return null;

  const recs = (recsResult.data ?? []) as unknown as {
    competency_key: string;
    title: string;
    provider_name: string | null;
    cpd_hours: number | null;
    score: number;
  }[];

  const lines = gaps.map((g, i) => {
    const match = recs.find((r) => r.competency_key === g.competency_key);
    return `${i + 1}. ${g.competency_name} — ${g.priority_band_key.replace(/_/g, ' ')} priority, ${g.gap_size} level${g.gap_size === 1 ? '' : 's'} to close. ${
      match
        ? `The ranked match is "${match.title}"${match.provider_name ? ` (${match.provider_name})` : ''}${match.cpd_hours ? `, ${Number(match.cpd_hours)} CPD hours` : ''}.`
        : 'No catalogue activity currently addresses this — worth raising with your reviewer.'
    }`;
  });

  return {
    headline: `A draft plan for your ${gaps.length} highest-priority gap${gaps.length === 1 ? '' : 's'}`,
    body: joinSentences([
      'This is a draft assembled from your ranked gaps and the catalogue, in priority order:',
      lines.join(' '),
      'Nothing here is scheduled and nothing is committed. Adding an item to your Learning Map is your decision and your reviewer approves it — and remember that completing any of these does not by itself raise a competency level. Application in your teaching, evidenced and verified, is what does.',
    ]),
    inputs: [
      ...gaps.map((g) => ({
        source: 'Identified gap',
        detail: `${g.competency_name} — priority ${g.priority_score}/100, gap of ${g.gap_size}`,
      })),
      ...gaps
        .map((g) => recs.find((r) => r.competency_key === g.competency_key))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map((r) => ({
          source: 'Ranked recommendation',
          detail: `${r.title} — score ${r.score}`,
        })),
    ],
  };
}

async function composeReflectionSummary(
  teacherProfileId: string,
  yearId: string,
): Promise<Composed | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('plan_item_detail')
    .select(
      'competency_name, activity_title, reflection, application_summary, reflected_at, status',
    )
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .not('reflection', 'is', null)
    .order('reflected_at', { ascending: false });

  const items = (data ?? []) as unknown as {
    competency_name: string;
    activity_title: string | null;
    reflection: string;
    application_summary: string | null;
    status: string;
  }[];
  if (items.length === 0) return null;

  const applied = items.filter((i) => i.application_summary);

  return {
    headline: `${items.length} reflection${items.length === 1 ? '' : 's'} recorded, ${applied.length} carried through into practice`,
    body: joinSentences([
      `Your most recent was on ${items[0]!.activity_title ?? items[0]!.competency_name}, where you wrote: "${items[0]!.reflection}"`,
      items[0]!.application_summary
        ? `You then recorded what changed: "${items[0]!.application_summary}"`
        : 'You have not yet recorded what changed in your teaching as a result — that step is what turns a reflection into evidence.',
      items.length > 1
        ? `Across all ${items.length}, the competencies you have reflected on are ${[...new Set(items.map((i) => i.competency_name))].join(', ')}.`
        : null,
      applied.length < items.length
        ? `${items.length - applied.length} reflection${items.length - applied.length === 1 ? ' is' : 's are'} waiting on an application note.`
        : 'Every reflection has an application note against it.',
      'Your words are quoted, not paraphrased. A summary that rewrote them would be a different reflection.',
    ]),
    inputs: items.map((i) => ({
      source: 'Your reflection',
      detail: `${i.activity_title ?? i.competency_name} — ${i.status.replace(/_/g, ' ')}`,
    })),
  };
}

async function composePostCpdSupport(
  teacherProfileId: string,
  yearId: string,
): Promise<Composed | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('plan_item_detail')
    .select(
      'competency_name, activity_title, provider_name, cpd_hours, status, completed_at, reflection',
    )
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .in('status', ['completed', 'reflected'])
    .order('completed_at', { ascending: false })
    .limit(1);

  const item = (data ?? [])[0] as unknown as
    | {
        competency_name: string;
        activity_title: string | null;
        provider_name: string | null;
        cpd_hours: number | null;
        status: string;
        reflection: string | null;
      }
    | undefined;
  if (!item) return null;

  // Prompts, not prose. What a teacher needs after a course is a question they
  // can answer from their own practice — writing the reflection for them would
  // put words in their professional record that are not theirs.
  const prompts = [
    `What did "${item.activity_title ?? 'the activity'}" change about how you think about ${item.competency_name.toLowerCase()}?`,
    'What will a class of yours look different for as a result, and in which unit or lesson specifically?',
    'What would show somebody else that it reached your teaching — a revised task, a rubric, student work, an observation?',
    'What did not work, or what are you still unsure about?',
  ];

  return {
    headline: `Reflecting on ${item.activity_title ?? 'your completed activity'}`,
    body: joinSentences([
      `You completed this against ${item.competency_name}${item.provider_name ? `, provided by ${item.provider_name}` : ''}${item.cpd_hours ? `, ${Number(item.cpd_hours)} CPD hours` : ''}.`,
      item.reflection
        ? 'You have already written a reflection; these prompts may help you extend it.'
        : 'These prompts may help you write your reflection.',
      prompts.map((q, i) => `${i + 1}. ${q}`).join(' '),
      'Write it for yourself, not for the record. The next step is recording what actually changed in your teaching — a completed course does not move a competency level on its own.',
    ]),
    inputs: [
      {
        source: 'Learning Map item',
        detail: `${item.activity_title ?? 'Activity'} for ${item.competency_name} — ${item.status.replace(/_/g, ' ')}`,
      },
    ],
  };
}

async function composeProgressionExplanation(
  teacherProfileId: string,
  yearId: string,
): Promise<Composed | null> {
  const supabase = await createClient();
  const [profileResult, gapsResult, cpdResult] = await Promise.all([
    supabase
      .schema('core')
      .from('teacher_profile')
      .select(
        'id, career_level:career_level_id(display_name, level_order), teacher_category:teacher_category_id(display_name)',
      )
      .eq('id', teacherProfileId)
      .maybeSingle(),
    supabase
      .schema('growth')
      .from('gap_detail')
      .select('competency_name, gap_size')
      .eq('teacher_profile_id', teacherProfileId)
      .eq('academic_year_id', yearId)
      .gt('gap_size', 0),
    supabase
      .schema('compliance')
      .rpc('cpd_progress', { p_teacher_profile_id: teacherProfileId, p_academic_year_id: yearId }),
  ]);

  const profile = profileResult.data as unknown as {
    career_level: { display_name: string; level_order: number } | null;
    teacher_category: { display_name: string } | null;
  } | null;
  if (!profile) return null;

  const gaps = (gapsResult.data ?? []) as unknown as { competency_name: string }[];
  const total = (
    (cpdResult.data ?? []) as unknown as {
      dimension: string;
      completed_hours: number;
      required_hours: number;
      state: string;
    }[]
  ).find((r) => r.dimension === 'total');

  return {
    headline: `What the platform records against your progression`,
    body: joinSentences([
      profile.career_level
        ? `You are recorded at ${profile.career_level.display_name}${profile.teacher_category ? `, as a ${profile.teacher_category.display_name}` : ''}.`
        : 'No career level is recorded against your profile.',
      gaps.length > 0
        ? `${gaps.length} competency gap${gaps.length === 1 ? ' is' : 's are'} open against the expectations for your post: ${gaps.map((g) => g.competency_name).join(', ')}.`
        : 'Every expectation set for your post has been met.',
      total
        ? `Your CPD position is ${Number(total.completed_hours)} of ${Number(total.required_hours)} hours, ${total.state.replace(/_/g, ' ')}.`
        : 'No CPD requirement is in force for you this year.',
      // The honest part, and the reason this composer exists rather than a
      // checklist: the school has not established which service rules apply, so
      // there is no criteria list to publish, and inventing one would be worse
      // than saying so.
      'What this does NOT tell you is what you must do to progress. Career progression here is a professional judgement made at appraisal by a person — it is not calculated, and no criteria list is published, because the school has not yet established which service rules apply to it. The items above are what the platform holds and what your appraisal will draw on; they are not a set of conditions that guarantee anything.',
    ]),
    inputs: [
      {
        source: 'Career level',
        detail: profile.career_level?.display_name ?? 'Not recorded',
      },
      ...gaps.map((g) => ({ source: 'Open gap', detail: g.competency_name })),
      ...(total
        ? [
            {
              source: 'CPD position',
              detail: `${Number(total.completed_hours)} of ${Number(total.required_hours)} hours — ${total.state.replace(/_/g, ' ')}`,
            },
          ]
        : []),
    ],
  };
}

export async function compose(
  kind: SuggestionKind,
  teacherProfileId: string,
  yearId: string,
  competencyKey?: string,
): Promise<Composed | null> {
  switch (kind) {
    case 'explain_competency_gap':
      return composeGapExplanation(teacherProfileId, yearId, competencyKey);
    case 'recommend_development_goal':
      return composeGoalSuggestion(teacherProfileId, yearId, competencyKey);
    case 'explain_cpd_match':
      return composeCpdMatch(teacherProfileId);
    case 'explain_cpd_compliance_deficit':
      return composeCpdDeficit(teacherProfileId, yearId);
    case 'summarise_evidence':
      return composeEvidenceSummary(teacherProfileId, yearId);
    case 'observation_themes':
      return composeObservationThemes(teacherProfileId, yearId);
    case 'explain_assessment_feedback':
      return composeFeedbackExplanation(teacherProfileId, yearId);
    case 'draft_development_plan':
      return composeDraftPlan(teacherProfileId, yearId);
    case 'summarise_reflections':
      return composeReflectionSummary(teacherProfileId, yearId);
    case 'post_cpd_reflection_support':
      return composePostCpdSupport(teacherProfileId, yearId);
    case 'explain_progression_requirements':
      return composeProgressionExplanation(teacherProfileId, yearId);
  }
}
