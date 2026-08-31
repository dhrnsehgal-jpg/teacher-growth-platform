'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './growth';

function fail(message: string): ActionResult {
  return { ok: false, message };
}

/** Records a newly arrived circular or rule. */
export async function raiseChangeRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('Not signed in.');

  const title = String(formData.get('title') ?? '').trim();
  const summary = String(formData.get('summary') ?? '').trim();
  const receivedFrom = String(formData.get('receivedFrom') ?? '').trim();
  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim();

  if (title.length < 5) return fail('Give the change a title of at least 5 characters.');
  if (!sourceUrl && !receivedFrom) {
    return fail(
      'Say where this came from — a URL or who supplied it. A regulatory change with no citable origin is a rumour, and this platform will not track one.',
    );
  }

  const { data: school } = await supabase
    .schema('core')
    .from('school')
    .select('id')
    .limit(1)
    .maybeSingle();
  const schoolId = (school as unknown as { id: string } | null)?.id;
  if (!schoolId) return fail('No school is visible to this account.');

  const { error } = await supabase
    .schema('regulatory')
    .from('change_request')
    .insert({
      school_id: schoolId,
      title,
      summary: summary || null,
      received_from: receivedFrom || null,
      source_url: sourceUrl || null,
      raised_by: auth.user.id,
    });
  if (error) return fail(error.message);

  revalidatePath('/admin/regulatory');
  return { ok: true, message: 'Recorded. It now needs a Compliance Administrator to review it.' };
}

/**
 * Moves a change to its next stage.
 *
 * Every stage past the first two requires a named reviewer and a written note —
 * the database refuses otherwise. That is what makes activation a human act.
 */
export async function advanceChangeRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('Not signed in.');

  const changeId = String(formData.get('changeId') ?? '');
  const nextStage = String(formData.get('nextStage') ?? '');
  const note = String(formData.get('reviewNote') ?? '').trim();
  const applicability = String(formData.get('applicability') ?? '');
  const applicabilityNote = String(formData.get('applicabilityNote') ?? '').trim();
  const effectiveFrom = String(formData.get('effectiveFrom') ?? '');

  if (!changeId || !nextStage) return fail('Choose a stage.');

  const update: Record<string, unknown> = { stage: nextStage };

  if (!['received', 'source_recorded'].includes(nextStage)) {
    if (note.length < 20) {
      return fail(
        'Record what you concluded, in at least 20 characters. Every stage past recording the source is a judgement, and it needs to be readable later.',
      );
    }
    update.reviewed_by = auth.user.id;
    update.reviewed_at = new Date().toISOString();
    update.review_note = note;
  }

  if (nextStage === 'applicability_determined') {
    if (!applicability) return fail('Determine whether it applies.');
    if (applicabilityNote.length < 20) {
      return fail('Say why it does or does not apply, in at least 20 characters.');
    }
    update.applicability_determination = applicability;
    update.applicability_note = applicabilityNote;
  }

  if (nextStage === 'version_created') {
    if (!effectiveFrom) return fail('A rule version needs an effective date.');
    update.effective_from = effectiveFrom;
  }

  const { error } = await supabase
    .schema('regulatory')
    .from('change_request')
    .update(update)
    .eq('id', changeId);
  if (error) return fail(error.message);

  revalidatePath('/admin/regulatory');
  return {
    ok: true,
    message:
      nextStage === 'activated'
        ? 'Activated. Administrators have been notified, and the change is on the audit trail.'
        : `Moved to ${nextStage.replace(/_/g, ' ')}.`,
  };
}
