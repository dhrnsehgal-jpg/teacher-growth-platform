import { createClient } from '@/lib/supabase/server';

/**
 * Request-scoped client, or null when Supabase is not configured.
 *
 * Read paths degrade to empty states rather than throwing. Two reasons:
 * a fresh checkout with no `.env.local` should still render, and — because
 * `supabase start` needs Docker — the interface has to be inspectable on
 * machines that do not have it.
 *
 * Write paths do NOT use this. An action that cannot reach the database must
 * fail loudly rather than silently appear to succeed.
 */
export async function dataClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('replace-with') || key.includes('replace-with')) {
    return null;
  }
  try {
    return await createClient();
  } catch {
    return null;
  }
}
