'use server';

import { revalidatePath } from 'next/cache';

import {
  ADVISORY_LABEL,
  compose,
  externalAssistanceEnabled,
  type SuggestionKind,
} from '@/lib/ai/assistant';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './growth';

function fail(message: string): ActionResult {
  return { ok: false, message };
}

/**
 * Generates an assistant suggestion.
 *
 * The suggestion is stored as advice and nothing consumes it. It cannot change
 * a competency level, an appraisal outcome or an increment decision, because no
 * code path leads from `ai.suggestion` to any of those.
 */
export async function generateSuggestion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('Not signed in.');

  const kind = String(formData.get('kind') ?? '') as SuggestionKind;
  const teacherProfileId = String(formData.get('teacherProfileId') ?? '');
  const competencyKey = String(formData.get('competencyKey') ?? '') || undefined;

  if (!kind || !teacherProfileId) return fail('Choose what to explain.');

  const { data: year } = await supabase
    .schema('core')
    .from('academic_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  const yearId = (year as unknown as { id: string } | null)?.id;
  if (!yearId) return fail('No academic year is current.');

  const composed = await compose(kind, teacherProfileId, yearId, competencyKey);
  if (!composed) {
    return fail(
      'There is nothing on record to explain yet. The assistant works from stored evidence, and inventing advice from an empty record is exactly what it must not do.',
    );
  }

  const { data: profile } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select('school_id')
    .eq('id', teacherProfileId)
    .maybeSingle();
  const schoolId = (profile as unknown as { school_id: string } | null)?.school_id;
  if (!schoolId) return fail('That teacher is not visible to you.');

  // External assistance would enrich the wording here. It is off until the
  // controls are recorded, so the deterministic composition stands on its own.
  const external = await externalAssistanceEnabled();

  const { error } = await supabase.schema('ai').from('suggestion').insert({
    school_id: schoolId,
    teacher_profile_id: teacherProfileId,
    academic_year_id: yearId,
    kind,
    mode: 'deterministic',
    headline: composed.headline,
    body: composed.body,
    advisory_label: ADVISORY_LABEL,
    inputs: composed.inputs,
    generated_by: auth.user.id,
  });

  if (error) return fail(error.message);

  revalidatePath('/assistant');
  revalidatePath('/dashboard');
  return {
    ok: true,
    message: external
      ? 'Suggestion generated. Professional judgement is still required.'
      : 'Suggestion composed from your stored records. External AI assistance is switched off, so nothing left this system.',
  };
}

/** Records what a human did with a suggestion. */
export async function actOnSuggestion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('Not signed in.');

  const suggestionId = String(formData.get('suggestionId') ?? '');
  const note = String(formData.get('actionNote') ?? '').trim();
  if (!suggestionId) return fail('No suggestion specified.');
  if (note.length < 10) {
    return fail(
      'Say briefly what you decided. A suggestion acted on without a note leaves no trace of the judgement that was applied.',
    );
  }

  const { error } = await supabase
    .schema('ai')
    .from('suggestion')
    .update({
      acted_on: true,
      action_note: note,
      acted_by: auth.user.id,
      acted_at: new Date().toISOString(),
    })
    .eq('id', suggestionId);
  if (error) return fail(error.message);

  revalidatePath('/assistant');
  return { ok: true, message: 'Recorded.' };
}
