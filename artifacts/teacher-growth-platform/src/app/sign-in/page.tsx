import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { checkRateLimit, clearRateLimit } from '@/lib/security/rate-limit';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Sign in' };

export const dynamic = 'force-dynamic';

async function signIn(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');

  // Keyed on the address rather than the email: an attacker choosing a new
  // email each attempt would otherwise never hit the limit. It does mean a
  // shared school NAT can exhaust the allowance for everyone behind it, which
  // is why the window is generous and a success clears it.
  const forwarded = (await headers()).get('x-forwarded-for');
  const key = forwarded?.split(',')[0]?.trim() || 'unknown';
  const limit = checkRateLimit(key);

  if (!limit.allowed) {
    redirect(
      `/sign-in?error=${encodeURIComponent(
        `Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      )}&next=${encodeURIComponent(next)}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // The message is Supabase's, which does not distinguish an unknown address
    // from a wrong password — so this does not leak whether an account exists.
    redirect(
      `/sign-in?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`,
    );
  }

  clearRateLimit(key);
  redirect(next.startsWith('/') ? next : '/dashboard');
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Teacher Growth</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in with the account your school provisioned. Accounts cannot be self-registered.
      </p>

      <form action={signIn} className="mt-8 space-y-4">
        <input type="hidden" name="next" value={params.next ?? '/dashboard'} />

        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className="mt-1 w-full rounded-md border border-input bg-transparent p-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-input bg-transparent p-2 text-sm"
          />
        </div>

        {params.error && (
          <p
            role="alert"
            className="rounded-md border bg-caution p-2 text-sm text-caution-foreground"
          >
            {params.error}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-md border bg-foreground px-3 py-2 text-sm font-medium text-background"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
