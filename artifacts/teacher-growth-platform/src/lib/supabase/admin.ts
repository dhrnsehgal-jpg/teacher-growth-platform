/**
 * Service-role Supabase client — BYPASSES Row Level Security.
 *
 * Legitimate uses are narrow: provisioning a school, seeding roles, scheduled
 * regulatory-review jobs. It must never be used to serve a request on behalf of
 * a signed-in user, because doing so silently discards every tenant and scope
 * boundary in the database.
 *
 * `eslint.config.mjs` blocks importing this module from anywhere it does not
 * belong. Every call made through it must write an `audit.log_event` entry with
 * source 'system'.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

let cached: ReturnType<typeof createSupabaseClient> | null = null;

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('The service-role client must never be constructed in the browser.');
  }

  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use the admin client.',
    );
  }

  cached = createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
