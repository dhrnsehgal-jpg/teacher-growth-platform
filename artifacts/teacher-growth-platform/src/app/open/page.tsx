import { redirect } from 'next/navigation';

import { DEMO_PERSONAS, demoAccessEnabled } from '@/lib/demo-access';

export const metadata = { title: 'Open the demo' };

export const dynamic = 'force-dynamic';

/**
 * The password-free way in.
 *
 * Only reachable when the demo flag is set; otherwise it redirects to the real
 * sign-in form, which is the only way in for a deployment.
 */
export default async function OpenDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!demoAccessEnabled()) redirect('/sign-in');

  const { next } = await searchParams;
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Teacher Professional Growth</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        A demonstration for one CBSE-affiliated school in Punjab, Balvatika to Class XII. Choose who
        to look as — everyone here is fictional and every record is synthetic.
      </p>

      <ul className="mt-8 divide-y rounded-lg border">
        {DEMO_PERSONAS.map((p) => (
          <li key={p.key}>
            <a
              href={`/api/demo-user?as=${p.key}&next=${encodeURIComponent(target)}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:bg-muted"
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-sm text-muted-foreground">{p.role}</span>
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-muted-foreground">
        This chooser signs you in for real. Every page then runs under the same access rules as a
        live deployment: a teacher cannot see a colleague&rsquo;s appraisal, a head of department
        supervising someone&rsquo;s development still sees nothing of their pay position, and the
        Principal cannot read the audit log. The differences you notice between these people are the
        security model working, not a simulation of it.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Available only in development with <code>DEMO_NO_LOGIN=1</code>. A deployment has no way in
        but the password form.
      </p>
    </main>
  );
}
