/**
 * Stage 3 reads: assessment, gaps, recommendations and the Learning Map.
 *
 * Everything here goes through the request-scoped Supabase client, so RLS
 * applies. Cross-schema joins are served by the views created in migration 0024
 * — PostgREST cannot embed across schemas.
 */

import { createClient } from '@/lib/supabase/server';
import type { SourceAlignment, SourceFramework } from '@/lib/competency/source';

export interface GapFactor {
  factor: string;
  points: number;
  why: string;
}

export interface GapDetail {
  id: string;
  teacher_profile_id: string;
  competency_id: string;
  competency_key: string;
  competency_name: string;
  competency_description: string;
  domain_name: string;
  standard_name: string;
  expected_ordinal: number;
  verified_ordinal: number | null;
  gap_size: number;
  priority_score: number;
  priority_band_key: string;
  priority_label: string | null;
  priority_sort: number | null;
  expected_level_name: string | null;
  verified_level_name: string | null;
  factors: GapFactor[];
  explanation: string;
  engine_version: string;
  computed_at: string;
  source_framework: SourceFramework;
  source_alignment: SourceAlignment;
  external_reference: string | null;
}

export interface RecommendationDetail {
  id: string;
  rank: number;
  score: number;
  reasons: GapFactor[];
  activity_id: string;
  activity_key: string;
  title: string;
  description: string;
  learning_outcomes: string;
  delivery_method: string;
  duration_hours: number;
  cpd_hours: number;
  cost_amount: number | null;
  cost_currency: string;
  prerequisite: string | null;
  url: string | null;
  availability: string;
  next_offering_on: string | null;
  evidence_requirement: string;
  provider_name: string;
  recognition: SourceFramework;
  recognition_alignment: SourceAlignment;
  external_reference: string | null;
  competency_key: string;
  competency_name: string;
  gap_id: string;
  engine_version: string;
}

export interface RatingDetail {
  id: string;
  source: 'self' | 'supervisor' | 'observation' | 'moderation';
  level_key: string;
  level_name: string;
  level_ordinal: number;
  rationale: string;
  rated_at: string;
  rated_by_name: string | null;
  competency_key: string;
  competency_name: string;
}

export interface VerifiedCompetency {
  id: string;
  competency_id: string;
  competency_key: string;
  competency_name: string;
  verified_ordinal: number;
  verified_level_name: string;
  expected_ordinal: number;
  expected_level_name: string;
  evidence_strength: string;
  evidence_count: number;
  rationale: string;
  verified_at: string;
  verified_by_name: string | null;
  is_reassessment: boolean;
}

export interface PlanItemDetail {
  id: string;
  status: string;
  competency_id: string;
  competency_key: string;
  competency_name: string;
  gap_id: string | null;
  activity_title: string | null;
  provider_name: string | null;
  cpd_hours: number | null;
  selection_rationale: string | null;
  due_on: string | null;
  owner_name: string | null;
  proposed_at: string;
  approved_at: string | null;
  approval_note: string | null;
  started_at: string | null;
  completed_at: string | null;
  reflected_at: string | null;
  reflection: string | null;
  applied_at: string | null;
  application_summary: string | null;
  impact_verified_at: string | null;
  impact_verification_note: string | null;
  impact_verified_by_name: string | null;
  reassessed_at: string | null;
  evidence_count: number;
  verified_evidence_count: number;
  teacher_profile_id: string;
  learning_plan_id: string;
}

export interface CompetencyHistoryPoint {
  id: string;
  competency_key: string;
  competency_name: string;
  verified_ordinal: number;
  verified_level_name: string;
  expected_ordinal: number;
  verified_at: string;
  is_reassessment: boolean;
  rationale: string;
  verified_by_name: string | null;
}

/** The signed-in user's teacher profile, if they have one. */
export async function getSessionProfile() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select(
      `id, employee_code, has_leadership_responsibility,
       user:user_id!inner(full_name, email),
       department:primary_department_id(display_name),
       teacher_category:teacher_category_id(display_name),
       career_level:career_level_id(display_name)`,
    )
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (!data) return null;
  return {
    ...(data as unknown as {
      id: string;
      employee_code: string | null;
      has_leadership_responsibility: boolean;
      user: { full_name: string; email: string };
      department: { display_name: string } | null;
      teacher_category: { display_name: string } | null;
      career_level: { display_name: string } | null;
    }),
    userId: auth.user.id,
  };
}

export async function getCurrentYear() {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('core')
    .from('academic_year')
    .select('id, label')
    .eq('is_current', true)
    .maybeSingle();
  return (data as unknown as { id: string; label: string }) ?? null;
}

export async function getGaps(teacherProfileId: string, yearId: string): Promise<GapDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('gap_detail')
    .select('*')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .order('priority_score', { ascending: false });
  return (data ?? []) as unknown as GapDetail[];
}

export async function getGapByCompetency(
  teacherProfileId: string,
  yearId: string,
  competencyKey: string,
): Promise<GapDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('gap_detail')
    .select('*')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .eq('competency_key', competencyKey)
    .maybeSingle();
  return (data as unknown as GapDetail) ?? null;
}

export async function getRecommendations(gapId: string): Promise<RecommendationDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('cpd')
    .from('recommendation_detail')
    .select('*')
    .eq('gap_id', gapId)
    .order('rank');
  return (data ?? []) as unknown as RecommendationDetail[];
}

export async function getRatings(
  teacherProfileId: string,
  competencyKey?: string,
): Promise<RatingDetail[]> {
  const supabase = await createClient();
  let query = supabase
    .schema('assessment')
    .from('rating_detail')
    .select('*')
    .eq('teacher_profile_id', teacherProfileId);
  if (competencyKey) query = query.eq('competency_key', competencyKey);
  const { data } = await query;
  return (data ?? []) as unknown as RatingDetail[];
}

export async function getVerifiedCompetencies(
  teacherProfileId: string,
): Promise<VerifiedCompetency[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('assessment')
    .from('current_verified_competency')
    .select('*')
    .eq('teacher_profile_id', teacherProfileId);
  return (data ?? []) as unknown as VerifiedCompetency[];
}

export async function getCompetencyHistory(
  teacherProfileId: string,
  competencyKey?: string,
): Promise<CompetencyHistoryPoint[]> {
  const supabase = await createClient();
  let query = supabase
    .schema('assessment')
    .from('competency_history')
    .select('*')
    .eq('teacher_profile_id', teacherProfileId);
  if (competencyKey) query = query.eq('competency_key', competencyKey);
  const { data } = await query;
  return (data ?? []) as unknown as CompetencyHistoryPoint[];
}

export async function getLearningPlan(teacherProfileId: string, yearId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('learning_plan')
    .select('id, title, status, submitted_at, approved_at, approval_note')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .maybeSingle();
  return (
    (data as unknown as {
      id: string;
      title: string;
      status: string;
      submitted_at: string | null;
      approved_at: string | null;
      approval_note: string | null;
    }) ?? null
  );
}

export async function getPlanItems(teacherProfileId: string): Promise<PlanItemDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('plan_item_detail')
    .select('*')
    .eq('teacher_profile_id', teacherProfileId)
    .order('proposed_at');
  return (data ?? []) as unknown as PlanItemDetail[];
}

/** Staff the signed-in user can see beyond themselves — the manager's list. */
export async function getSupervisedTeachers(selfProfileId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select(
      `id, employee_code,
       user:user_id!inner(full_name),
       department:primary_department_id(display_name),
       teacher_category:teacher_category_id(display_name)`,
    )
    .neq('id', selfProfileId)
    .eq('is_active', true);
  return (data ?? []) as unknown as {
    id: string;
    employee_code: string | null;
    user: { full_name: string };
    department: { display_name: string } | null;
    teacher_category: { display_name: string } | null;
  }[];
}

export async function getEvidenceAwaitingReview(schoolId?: string) {
  const supabase = await createClient();
  let query = supabase
    .schema('evidence')
    .from('evidence')
    .select('id, title, status, submitted_at, teacher_profile_id, evidence_type_id')
    .in('status', ['submitted', 'under_review'])
    .order('submitted_at');
  if (schoolId) query = query.eq('school_id', schoolId);
  const { data } = await query;
  return (data ?? []) as unknown as {
    id: string;
    title: string;
    status: string;
    submitted_at: string | null;
    teacher_profile_id: string;
  }[];
}

export async function getTeacherKpiSummary(teacherProfileId: string, yearId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('kpi')
    .from('teacher_kpi_detail')
    .select('id, name, weight, target, status, is_student_outcome_measure, category_name')
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .order('weight', { ascending: false });
  return (data ?? []) as unknown as {
    id: string;
    name: string;
    weight: number;
    target: string;
    status: string;
    is_student_outcome_measure: boolean;
    category_name: string | null;
  }[];
}

/** The next thing that needs doing on a plan item, and who owns it. */
export function nextAction(item: PlanItemDetail): { label: string; owner: 'teacher' | 'manager' } {
  switch (item.status) {
    case 'proposed':
      return { label: 'Awaiting manager approval', owner: 'manager' };
    case 'approved':
      return { label: 'Start the activity', owner: 'teacher' };
    case 'in_progress':
      return { label: 'Mark the activity complete', owner: 'teacher' };
    case 'completed':
      return { label: 'Record what you took from it', owner: 'teacher' };
    case 'reflected':
      return { label: 'Apply it and submit evidence', owner: 'teacher' };
    case 'applied':
      return { label: 'Awaiting verification of application', owner: 'manager' };
    case 'impact_verified':
      return { label: 'Ready for reassessment', owner: 'manager' };
    case 'reassessed':
      return { label: 'Complete', owner: 'teacher' };
    case 'declined':
      return { label: 'Declined — choose another activity', owner: 'teacher' };
    default:
      return { label: '—', owner: 'teacher' };
  }
}

export const PLAN_STAGES = [
  'proposed',
  'approved',
  'in_progress',
  'completed',
  'reflected',
  'applied',
  'impact_verified',
  'reassessed',
] as const;

export function stageIndex(status: string): number {
  const i = (PLAN_STAGES as readonly string[]).indexOf(status);
  return i === -1 ? 0 : i;
}

/**
 * Every plan item the signed-in user can see. RLS already restricts this to
 * their own record plus staff within their authorised scope, so no explicit
 * teacher filter is needed — and adding one would risk disagreeing with RLS.
 */
export async function getTeamPlanItems(): Promise<PlanItemDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('plan_item_detail')
    .select('*')
    .order('proposed_at');
  return (data ?? []) as unknown as PlanItemDetail[];
}

/** Every gap the signed-in user can see, highest priority first. */
export async function getTeamGaps(yearId: string): Promise<GapDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('gap_detail')
    .select('*')
    .eq('academic_year_id', yearId)
    .gt('gap_size', 0)
    .order('priority_score', { ascending: false });
  return (data ?? []) as unknown as GapDetail[];
}

/** Teacher assessments still awaiting a supervisor rating or verification. */
export async function getPendingAssessments() {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('assessment')
    .from('teacher_assessment')
    .select('id, teacher_profile_id, status, self_submitted_at, supervisor_submitted_at, cycle_id')
    .neq('status', 'verified')
    .order('created_at');
  return (data ?? []) as unknown as {
    id: string;
    teacher_profile_id: string;
    status: string;
    self_submitted_at: string | null;
    supervisor_submitted_at: string | null;
  }[];
}

/** Names for a set of teacher profile ids, for rendering team lists. */
export async function getProfileNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select('id, user:user_id!inner(full_name)')
    .in('id', ids);
  const rows = (data ?? []) as unknown as { id: string; user: { full_name: string } }[];
  return new Map(rows.map((r) => [r.id, r.user.full_name]));
}

/**
 * A short-lived signed URL for an evidence file.
 *
 * The bucket is private, so this is the only way to read one. Signing happens
 * server-side with the caller's session, which means the storage policies in
 * migration 0029 have already decided whether they may see it.
 */
export interface EvidenceFileLink {
  url: string | null;
  reason: string | null;
}

/**
 * A short-lived URL for an evidence file — or the reason there isn't one.
 *
 * Routed through `evidence.file_servable()`, which returns the storage path
 * only when the file has been scanned clean. Unscanned, failed and infected
 * files never yield a path, so this function cannot mint a URL for one even by
 * mistake. The storage policy enforces the same rule on the other side.
 */
export async function getEvidenceFileUrl(
  evidenceId: string,
  expiresInSeconds = 300,
): Promise<EvidenceFileLink> {
  const supabase = await createClient();

  const { data } = await supabase.schema('evidence').rpc('file_servable', {
    p_evidence_id: evidenceId,
  });
  const row = (Array.isArray(data) ? data[0] : data) as
    { servable: boolean; reason: string | null; storage_path: string | null } | undefined;

  if (!row) return { url: null, reason: 'This file is not visible to you.' };
  if (!row.servable || !row.storage_path) {
    return { url: null, reason: row.reason ?? 'This file cannot be served.' };
  }

  const { data: signed, error } = await supabase.storage
    .from('evidence')
    .createSignedUrl(row.storage_path, expiresInSeconds);
  if (error) return { url: null, reason: 'The file could not be opened.' };

  return { url: signed?.signedUrl ?? null, reason: null };
}

export interface EvidenceRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  strength: string | null;
  storage_path: string | null;
  file_name: string | null;
  submitted_at: string | null;
  review_note: string | null;
}

/** Evidence attached to one learning plan item. */
export async function getPlanItemEvidence(planItemId: string): Promise<EvidenceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('growth')
    .from('plan_item_evidence')
    .select('evidence_id')
    .eq('learning_plan_item_id', planItemId);

  const ids = ((data ?? []) as unknown as { evidence_id: string }[]).map((r) => r.evidence_id);
  if (ids.length === 0) return [];

  const { data: rows } = await supabase
    .schema('evidence')
    .from('evidence')
    .select(
      'id, title, description, status, strength, storage_path, file_name, submitted_at, review_note',
    )
    .in('id', ids);
  return (rows ?? []) as unknown as EvidenceRow[];
}

/** Competencies expected of a teacher, with any standing ratings. */
export async function getAssessableCompetencies(teacherProfileId: string, yearId: string) {
  const supabase = await createClient();
  const { data } = await supabase.schema('competency').rpc('resolve_targets', {
    p_teacher_profile_id: teacherProfileId,
    p_academic_year_id: yearId,
  });
  return (data ?? []) as unknown as {
    competency_id: string;
    competency_key: string;
    competency_name: string;
    domain_name: string;
    standard_name: string;
    target_level_name: string;
    target_ordinal: number;
  }[];
}

// ---------------------------------------------------------------------------
// Dashboard panels the Stage 3 brief asked for
// ---------------------------------------------------------------------------

export interface OwnEvidenceRow {
  id: string;
  title: string;
  status: string;
  strength: string | null;
  occurred_on: string | null;
  review_note: string | null;
  evidence_type: { name: string } | null;
}

/** A teacher's own evidence for the year, newest first. */
export async function getOwnEvidence(
  teacherProfileId: string,
  yearId: string,
): Promise<OwnEvidenceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('evidence')
    .from('evidence')
    .select(
      'id, title, status, strength, occurred_on, review_note, evidence_type:evidence_type_id(name)',
    )
    .eq('teacher_profile_id', teacherProfileId)
    .eq('academic_year_id', yearId)
    .order('occurred_on', { ascending: false, nullsFirst: false });
  return (data ?? []) as unknown as OwnEvidenceRow[];
}

export interface FeedbackItem {
  id: string;
  kind: string;
  on: string | null;
  text: string;
  author: string | null;
}

/**
 * Recent feedback: what a manager actually wrote about this teacher.
 *
 * Gathered from the three places a reviewer writes prose — the observation
 * narrative, the note on an evidence decision, and the note on verifying that
 * development was applied in practice. Assembled here rather than in a view
 * because they live in three schemas and PostgREST cannot embed across them.
 *
 * Deliberately excludes the teacher's own words. "Recent feedback" means
 * feedback received; showing a teacher their own reflections back would pad the
 * panel and tell them nothing.
 */
export async function getRecentFeedback(
  teacherProfileId: string,
  yearId: string,
  limit = 5,
): Promise<FeedbackItem[]> {
  const supabase = await createClient();

  const [observations, evidence, planItems] = await Promise.all([
    supabase
      .schema('assessment')
      .from('observation')
      .select('id, observed_on, narrative, focus, observer_user_id')
      .eq('teacher_profile_id', teacherProfileId)
      .eq('academic_year_id', yearId)
      .order('observed_on', { ascending: false }),
    supabase
      .schema('evidence')
      .from('evidence')
      .select('id, title, review_note, reviewed_at, reviewed_by')
      .eq('teacher_profile_id', teacherProfileId)
      .eq('academic_year_id', yearId)
      .not('review_note', 'is', null)
      .order('reviewed_at', { ascending: false }),
    supabase
      .schema('growth')
      .from('plan_item_detail')
      .select(
        'id, competency_name, impact_verification_note, impact_verified_at, impact_verified_by_name',
      )
      .eq('teacher_profile_id', teacherProfileId)
      .not('impact_verification_note', 'is', null)
      .order('impact_verified_at', { ascending: false }),
  ]);

  const authorIds = new Set<string>();
  for (const o of (observations.data ?? []) as unknown as { observer_user_id: string }[]) {
    if (o.observer_user_id) authorIds.add(o.observer_user_id);
  }
  for (const e of (evidence.data ?? []) as unknown as { reviewed_by: string | null }[]) {
    if (e.reviewed_by) authorIds.add(e.reviewed_by);
  }
  const names = authorIds.size > 0 ? await getUserNames([...authorIds]) : new Map<string, string>();

  const items: FeedbackItem[] = [
    ...(
      (observations.data ?? []) as unknown as {
        id: string;
        observed_on: string;
        narrative: string;
        focus: string | null;
        observer_user_id: string;
      }[]
    ).map((o) => ({
      id: `obs-${o.id}`,
      kind: o.focus ? `Classroom observation — ${o.focus}` : 'Classroom observation',
      on: o.observed_on,
      text: o.narrative,
      author: names.get(o.observer_user_id) ?? null,
    })),
    ...(
      (evidence.data ?? []) as unknown as {
        id: string;
        title: string;
        review_note: string;
        reviewed_at: string | null;
        reviewed_by: string | null;
      }[]
    ).map((e) => ({
      id: `ev-${e.id}`,
      kind: `Evidence review — ${e.title}`,
      on: e.reviewed_at ? e.reviewed_at.slice(0, 10) : null,
      text: e.review_note,
      author: e.reviewed_by ? (names.get(e.reviewed_by) ?? null) : null,
    })),
    ...(
      (planItems.data ?? []) as unknown as {
        id: string;
        competency_name: string;
        impact_verification_note: string;
        impact_verified_at: string | null;
        impact_verified_by_name: string | null;
      }[]
    ).map((p) => ({
      id: `plan-${p.id}`,
      kind: `Impact verified — ${p.competency_name}`,
      on: p.impact_verified_at ? p.impact_verified_at.slice(0, 10) : null,
      text: p.impact_verification_note,
      author: p.impact_verified_by_name,
    })),
  ];

  return items.sort((a, b) => (b.on ?? '').localeCompare(a.on ?? '')).slice(0, limit);
}

/** Names for a set of user ids, in one round trip. */
async function getUserNames(ids: string[]): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('core')
    .from('app_user')
    .select('id, full_name')
    .in('id', ids);
  return new Map(
    ((data ?? []) as unknown as { id: string; full_name: string }[]).map((u) => [
      u.id,
      u.full_name,
    ]),
  );
}

export interface UpcomingReview {
  id: string;
  what: string;
  who: string | null;
  due: string;
  kind: 'cycle' | 'plan_item';
  overdue: boolean;
}

/**
 * What falls due next, for a manager.
 *
 * Two kinds, because they are the two things with real dates on them: an
 * assessment cycle closing, and a development plan item reaching its due date.
 * Overdue items sort first — a review that has already slipped matters more
 * than one approaching.
 */
export async function getUpcomingReviews(yearId: string, limit = 8): Promise<UpcomingReview[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [cycles, items] = await Promise.all([
    supabase
      .schema('assessment')
      .from('cycle')
      .select('id, name, closes_on, status')
      .eq('academic_year_id', yearId)
      .not('closes_on', 'is', null)
      .neq('status', 'closed')
      .order('closes_on'),
    supabase
      .schema('growth')
      .from('plan_item_detail')
      // `owner_name` is the plan item's owner, which is the teacher it belongs to.
      .select('id, competency_name, owner_name, due_on, status')
      .not('due_on', 'is', null)
      .not('status', 'in', '("reassessed","declined","abandoned")')
      .order('due_on'),
  ]);

  const reviews: UpcomingReview[] = [
    ...(
      (cycles.data ?? []) as unknown as {
        id: string;
        name: string;
        closes_on: string;
      }[]
    ).map((c) => ({
      id: `cycle-${c.id}`,
      what: c.name,
      who: null,
      due: c.closes_on,
      kind: 'cycle' as const,
      overdue: c.closes_on < today,
    })),
    ...(
      (items.data ?? []) as unknown as {
        id: string;
        competency_name: string;
        owner_name: string | null;
        due_on: string;
      }[]
    ).map((i) => ({
      id: `item-${i.id}`,
      what: i.competency_name,
      who: i.owner_name,
      due: i.due_on,
      kind: 'plan_item' as const,
      overdue: i.due_on < today,
    })),
  ];

  return reviews
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.due.localeCompare(b.due))
    .slice(0, limit);
}

/**
 * The strongest CPD recommendations across all of a teacher's open gaps.
 *
 * The per-competency page shows the full ranking with its reasoning; the
 * dashboard shows the top of it, so "what should I do next?" is answerable
 * without first knowing which competency to open.
 */
export async function getTopRecommendations(
  teacherProfileId: string,
  limit = 4,
): Promise<RecommendationDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('cpd')
    .from('recommendation_detail')
    .select('*')
    .eq('teacher_profile_id', teacherProfileId)
    .order('score', { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as RecommendationDetail[];
}
