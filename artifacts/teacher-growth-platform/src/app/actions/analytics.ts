'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './growth';

function fail(message: string): ActionResult {
  return { ok: false, message };
}

/**
 * Builds a cohort training plan from a gap cluster.
 *
 * Gap cluster → teacher group → relevant CPD → cohort plan, which the brief
 * names as the product differentiator. It reuses the Stage 3 machinery rather
 * than inventing a parallel one: each teacher gets a plan item at `proposed`,
 * which still needs their manager's approval and still cannot improve a
 * competency without evidenced impact.
 *
 * Cohort planning changes who gets offered what. It does not change what
 * counts as improvement.
 */
export async function createCohortPlan(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('Not signed in.');

  const competencyKey = String(formData.get('competencyKey') ?? '');
  const activityId = String(formData.get('activityId') ?? '');
  const rationale = String(formData.get('rationale') ?? '').trim();

  if (!competencyKey || !activityId) return fail('Choose a competency and an activity.');
  if (rationale.length < 20) {
    return fail(
      'Say why this cohort needs this course, in at least 20 characters. It is copied onto every teacher’s plan, and they are entitled to the reasoning.',
    );
  }

  const { data: year } = await supabase
    .schema('core')
    .from('academic_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  const yearId = (year as unknown as { id: string } | null)?.id;
  if (!yearId) return fail('No academic year is current.');

  const { data: comp } = await supabase
    .schema('competency')
    .from('competency')
    .select('id, school_id, name')
    .eq('key', competencyKey)
    .maybeSingle();
  const competency = comp as unknown as { id: string; school_id: string; name: string } | null;
  if (!competency) return fail('That competency is not visible to you.');

  // The cluster: everyone with an open gap on this competency who is in scope.
  const { data: gaps } = await supabase
    .schema('growth')
    .from('gap_detail')
    .select('id, teacher_profile_id')
    .eq('academic_year_id', yearId)
    .eq('competency_key', competencyKey)
    .gt('gap_size', 0);

  const cluster = (gaps ?? []) as unknown as { id: string; teacher_profile_id: string }[];
  if (cluster.length === 0) {
    return fail('No teacher in your scope has an open gap on that competency.');
  }

  let added = 0;
  let skipped = 0;

  for (const g of cluster) {
    // One learning plan per teacher per year; reuse it if it exists.
    const { data: existingPlan } = await supabase
      .schema('growth')
      .from('learning_plan')
      .select('id')
      .eq('teacher_profile_id', g.teacher_profile_id)
      .eq('academic_year_id', yearId)
      .maybeSingle();

    let planId = (existingPlan as unknown as { id: string } | null)?.id;
    if (!planId) {
      const { data: created, error } = await supabase
        .schema('growth')
        .from('learning_plan')
        .insert({
          school_id: competency.school_id,
          teacher_profile_id: g.teacher_profile_id,
          academic_year_id: yearId,
        })
        .select('id')
        .maybeSingle();
      if (error) {
        skipped += 1;
        continue;
      }
      planId = (created as unknown as { id: string }).id;
    }

    const { error } = await supabase
      .schema('growth')
      .from('learning_plan_item')
      .insert({
        school_id: competency.school_id,
        learning_plan_id: planId,
        gap_id: g.id,
        competency_id: competency.id,
        cpd_activity_id: activityId,
        status: 'proposed',
        selection_rationale: `Cohort plan: ${rationale}`,
      });

    if (error) skipped += 1;
    else added += 1;
  }

  revalidatePath('/analytics');
  revalidatePath('/manager');

  return {
    ok: true,
    message:
      `Cohort plan created for ${added} teacher${added === 1 ? '' : 's'}` +
      (skipped > 0 ? `; ${skipped} already had this activity on their plan` : '') +
      '. Each item is proposed and still needs the teacher’s manager to approve it.',
  };
}
