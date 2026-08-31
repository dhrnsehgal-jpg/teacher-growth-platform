'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Retires a competency. Deliberately routed through the database function
 * `competency.retire_competency`, which checks the permission, records who and
 * why, retires the indicators with it, and writes an audit entry — none of
 * which should be reimplemented here where it could drift.
 *
 * Nothing is deleted: past assessments against this competency stay readable.
 */
export async function retireCompetency(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const competencyId = String(formData.get('competencyId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const competencyKey = String(formData.get('competencyKey') ?? '');

  if (!competencyId) {
    return { ok: false, message: 'Missing competency.' };
  }
  if (reason.length < 10) {
    return {
      ok: false,
      message: 'Give a reason of at least 10 characters. It is kept on the record permanently.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.schema('competency').rpc('retire_competency', {
    p_competency_id: competencyId,
    p_reason: reason,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath(`/admin/framework/${competencyKey}`);
  revalidatePath('/admin/framework');
  return { ok: true, message: 'Competency retired. It remains on record with its history intact.' };
}
