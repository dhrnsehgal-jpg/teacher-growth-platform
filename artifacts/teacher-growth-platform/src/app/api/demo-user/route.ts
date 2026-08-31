import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { DEMO_PASSWORD, demoAccessEnabled, findPersona } from '@/lib/demo-access';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Opens the demo as a seeded persona, without a password prompt.
 *
 * It signs in for real and hands back an ordinary session cookie, so nothing
 * downstream knows or cares that the password was not typed. RLS, permissions
 * and every gate apply exactly as they would otherwise.
 *
 * Returns 404 unless development AND `DEMO_NO_LOGIN=1`, so it cannot become a
 * way to assume an identity in a deployed environment.
 */
export async function GET(request: NextRequest) {
  if (!demoAccessEnabled()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const persona = findPersona(request.nextUrl.searchParams.get('as'));
  if (!persona) {
    return new NextResponse('Unknown demo persona', { status: 400 });
  }

  const next = request.nextUrl.searchParams.get('next') ?? '/dashboard';
  // Same-origin relative paths only, so this cannot be used as an open redirect.
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  let response = NextResponse.redirect(new URL(target, request.nextUrl.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.redirect(new URL(target, request.nextUrl.origin));
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({
    email: persona.email,
    password: DEMO_PASSWORD,
  });

  if (error) {
    return new NextResponse(
      `Could not open the demo as ${persona.name}: ${error.message}. ` +
        'Is the database seeded? Try `npm run db:reset`.',
      { status: 500 },
    );
  }

  return response;
}
