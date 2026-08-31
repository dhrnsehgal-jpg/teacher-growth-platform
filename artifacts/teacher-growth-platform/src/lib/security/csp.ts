import type { NextRequest, NextResponse } from 'next/server';

/**
 * Content Security Policy, outstanding since Stage 1.
 *
 * Nonce-based rather than `unsafe-inline`: Next emits inline bootstrap scripts,
 * and allowing all inline script to accommodate them would defeat most of the
 * point. The nonce is generated per request, handed to Next through the
 * `x-nonce` request header, and named in the policy.
 *
 * `style-src` does permit `unsafe-inline`. That is a real, stated weakness:
 * Next injects inline styles during streaming, and nonce-ing them is not
 * currently possible without breaking the framework. Inline style is a much
 * narrower vector than inline script, but it is not nothing, and the security
 * document says so rather than presenting the policy as complete.
 */
export function applyCsp(request: NextRequest, response: NextResponse): void {
  const nonce = crypto.randomUUID().replace(/-/g, '');

  // Supabase needs both the HTTP origin (PostgREST, GoTrue, Storage) and its
  // websocket origin (realtime). `http` maps to `ws`, `https` to `wss` — the
  // first version only handled https and emitted the same origin twice.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const socketUrl = supabaseUrl.replace(/^http/, 'ws');
  const connectSrc = [...new Set(["'self'", supabaseUrl, socketUrl].filter(Boolean))].join(' ');

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // See the note above: inline style is permitted, inline script is not.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    // Sign-out is issued with fetch from the preview so the browser does not
    // mistake the proxied form navigation for a cross-origin submission.
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ];

  // Development runs eval for HMR; production must not.
  const policy =
    process.env.NODE_ENV === 'development'
      ? directives.map((d) => (d.startsWith('script-src') ? `${d} 'unsafe-eval'` : d)).join('; ')
      : directives.join('; ');

  request.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', policy);
}
