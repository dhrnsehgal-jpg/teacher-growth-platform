import type { NextRequest } from 'next/server';

import { applyCsp } from '@/lib/security/csp';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  // Applied after the session work so it lands on whichever response that
  // returned — including the redirect an unauthenticated request receives.
  applyCsp(request, response);
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};