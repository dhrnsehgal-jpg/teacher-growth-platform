/**
 * Server-side Supabase client.
 *
 * Uses the *anon* key and the caller's session, so every query runs under Row
 * Level Security as that user. This is the client all application code should
 * use. The service-role client (./admin.ts) is a separate, deliberately awkward
 * import.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * `CookieMethodsServer.setAll` is optional within a union type, so TypeScript
 * cannot contextually type the callback parameter. Annotated explicitly.
 */
type CookieToSet = { name: string; value: string; options: CookieOptions };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled by the middleware instead.
          }
        },
      },
    },
  );
}
