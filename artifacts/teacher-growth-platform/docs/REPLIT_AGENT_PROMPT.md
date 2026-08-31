# Prompt for the Replit Agent

Paste the block below into the Replit Agent after uploading the archive. It is
written to be read by an agent, so it is blunt and front-loads the prohibitions.

The reason it opens with prohibitions rather than instructions: an agent that
finds a Supabase app rendering empty pages will very reasonably conclude the
database is missing and offer to migrate it to Replit's built-in Postgres. That
would replace Row Level Security — the entire access boundary of this
application — with application-level filtering. The blank pages have a different
cause, and it is a dashboard setting.

---

```text
This is a COMPLETE, WORKING Next.js 16 application. 30 commits, 468 passing
tests, clean production build. Do not scaffold, rewrite, or restructure it.

Your job is narrow: install dependencies, build it, run it, and deploy it.

## DO NOT — these are not preferences, they break the product

1. DO NOT replace Supabase with Replit's Postgres, Drizzle, Prisma, or any
   other database layer. This application's access control is Row Level
   Security enforced by Postgres and reached through PostgREST, with GoTrue
   sessions. Swapping the database would mean rewriting 83 reads as raw SQL and
   enforcing policies against a connection pool instead of a signed-in user.
   That is the exact architecture this project was built to avoid. The database
   is a hosted Supabase project and stays there.

2. DO NOT modify anything in src/lib/supabase/, src/lib/data/, src/middleware.ts,
   or supabase/migrations/.

3. DO NOT run database migrations from here. They are applied separately from
   the developer's machine against the hosted project.

4. DO NOT set SUPABASE_SERVICE_ROLE_KEY as a secret. It bypasses Row Level
   Security completely. It is used by the seed script only and must never be
   present in the running application's environment.

5. DO NOT set DEMO_NO_LOGIN. It opens a password-free door. It is blocked in
   production builds, but a Replit dev session is not a production build and
   its URL is public.

6. DO NOT run the Playwright suite (npm run test:e2e). It drives a real
   lifecycle, is deliberately not idempotent, and would write to the hosted
   database.

7. DO NOT "fix" empty pages by changing code. See TROUBLESHOOTING below.

## What to do

1. Confirm Node 22. The .replit file already specifies it.

2. npm ci

3. Ask me for these three values and set them as Replit Secrets:
     NEXT_PUBLIC_SUPABASE_URL       (https://<ref>.supabase.co)
     NEXT_PUBLIC_SUPABASE_ANON_KEY  (the anon / publishable key)
     NEXT_PUBLIC_APP_URL            (this repl's URL)

4. npm run build

5. Deploy as an Autoscale deployment:
     build: npm run build
     run:   npm run start
   The .replit file already declares this. Do not change the run command —
   `next start -H 0.0.0.0` is required or Replit's proxy cannot reach the app.

6. Tell me the deployment URL and stop.

## TROUBLESHOOTING — read before diagnosing anything

If pages load but are EMPTY — no dashboards, no data, no error messages — the
cause is almost certainly NOT the code and NOT a missing database.

A hosted Supabase project exposes only the `public` schema by default. This
application uses seventeen. When a schema is not exposed, PostgREST refuses the
request, and this codebase's reads discard the error:

    const { data } = await supabase.schema('core').from('school').select('*');
    return (data ?? []);

So nothing throws and every page renders empty. It looks exactly like an empty
database, which is why an agent would reasonably but wrongly conclude the data
layer needs replacing.

The fix is a dashboard setting, not a code change. Tell me to go to
Supabase → Settings → API → Exposed schemas and add all seventeen:

  public, core, regulatory, audit, competency, kpi, evidence, growth,
  assessment, cpd, compliance, sqaaf, service, appraisal, pay, ai, privacy

To confirm the diagnosis before anyone changes anything, run:

  npm run check:hosted -- https://<ref>.supabase.co <anon-key>

It signs in and reports each schema separately, distinguishing "not exposed"
(dashboard setting) from "not granted" (a migration did not run). If that check
is green and pages are still empty, then and only then is it worth looking at
the application.

## Definition of done

- npm run build completes
- The deployment URL loads /sign-in
- Signing in as neha.sharma@demo-school.example shows a dashboard with numbers
- npm run check:hosted reports all schemas reachable

Then stop. Do not refactor, upgrade dependencies, add features, reorganise
files, or "improve" anything. The application is finished and under test.
```

---

## A shorter version

If the agent only needs the essentials:

```text
Complete Next.js 16 app, already working — install, build, deploy, nothing else.

Do NOT replace Supabase with Replit Postgres or any ORM: the security model is
Postgres Row Level Security via PostgREST, and swapping it would remove the
access boundary entirely. Do not set SUPABASE_SERVICE_ROLE_KEY or DEMO_NO_LOGIN.
Do not run migrations or the Playwright suite.

Steps: npm ci → ask me for NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
and NEXT_PUBLIC_APP_URL as Secrets → npm run build → Autoscale deploy with
`npm run start` (the -H 0.0.0.0 flag is required) → give me the URL and stop.

If pages render EMPTY with no errors, do not change code. It means the hosted
Supabase project has not exposed the app's seventeen schemas (Settings → API →
Exposed schemas). Confirm with: npm run check:hosted -- <url> <anon-key>
```
