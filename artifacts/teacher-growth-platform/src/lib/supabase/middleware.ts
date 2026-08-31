import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Paths reachable without a session. */
const PUBLIC_PATHS = ['/sign-in', '/open', '/api/preview-user', '/api/demo-user'];

/**
 * Refreshes the Supabase session on every request and guards the app.
 *
 * Server Components cannot write cookies, so token refresh has to happen here
 * or a session silently expires mid-visit.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Preview mode has no Supabase session; the preview user is a cookie.
  if (!url || !key || process.env.PREVIEW_DATABASE_URL) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const signIn = request.nextUrl.clone();
    // In a password-free demo, sending someone to a form they have no password
    // for is a dead end. They get the persona chooser instead.
    signIn.pathname =
      process.env.NODE_ENV !== 'production' && process.env.DEMO_NO_LOGIN === '1'
        ? '/open'
        : '/sign-in';
    signIn.searchParams.set('next', path);
    return NextResponse.redirect(signIn);
  }

  return response;
}
