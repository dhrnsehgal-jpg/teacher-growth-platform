import { NextResponse, type NextRequest } from 'next/server';

import { isPreviewMode, PREVIEW_COOKIE, PREVIEW_USERS } from '@/lib/data/preview';

/**
 * Switches the previewed user. DEVELOPMENT ONLY — returns 404 unless preview
 * mode is on, so this can never become a way to assume an identity in a real
 * deployment.
 */
export async function GET(request: NextRequest) {
  if (!isPreviewMode()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const requested = request.nextUrl.searchParams.get('as');
  const next = request.nextUrl.searchParams.get('next') ?? '/me';
  const user = PREVIEW_USERS.find((u) => u.key === requested);

  if (!user) {
    return new NextResponse('Unknown preview user', { status: 400 });
  }

  // Only same-origin relative paths, so the switcher cannot be used as an
  // open redirect.
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/me';

  const response = NextResponse.redirect(new URL(target, request.nextUrl.origin));
  response.cookies.set(PREVIEW_COOKIE, user.key, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}
