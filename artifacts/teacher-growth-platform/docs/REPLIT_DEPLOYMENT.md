# Deploying to Replit

**Replit runs the application. Supabase Cloud runs the database, authentication
and storage.** That split is not a preference — it is the only arrangement that
works, for the reason in the first section.

Read [`DEPLOYMENT.md`](DEPLOYMENT.md) for the general deployment picture and
[`SECURITY.md`](SECURITY.md) for the pre-production checklist. This document
covers only what is specific to Replit, and the things that will actually go
wrong.

---

## Why the backend cannot live on Replit

Replit offers a Postgres database. It is not enough, and the gap is not small.

This application's access boundary is **Row Level Security enforced by
Postgres, reached through PostgREST**, with authentication by **GoTrue** and
files in **Supabase Storage**. Every read in the data layer looks like this:

```ts
supabase.schema('growth').from('gap_detail').select('*');
```

That is a PostgREST call, not SQL. A bare Postgres instance gives you the
database and none of the three services on top of it. Moving to one would mean
rewriting all 83 reads plus every server action as raw SQL, reimplementing
sessions, and rebuilding storage access — and the RLS policies would then be
enforced against a connection pool rather than against a signed-in user, which
is precisely the architecture this project was built to avoid.

So: a free Supabase project holds the data. Replit holds the app.

**Region:** choose **ap-south-1 (Mumbai)** unless there is a recorded reason
not to. `DEPLOYMENT.md` explains the residency position; the short version is
that the school answers to its own staff for where their records live.

---

## The failure that will cost you an afternoon

On a hosted Supabase project, **"Exposed schemas" defaults to `public` alone.**
This application uses seventeen.

If a schema is not exposed, PostgREST refuses the request. And 83 reads in this
codebase are written like this:

```ts
const { data } = await supabase.schema('core').from('school').select('*');
return (data ?? []) as Row[];
```

The error is destructured away. **Nothing throws. Every page renders empty** —
no dashboards, no analytics, no competencies — and there is no message anywhere
saying why. It looks exactly like an empty database.

Two fixes, for two different causes:

| Symptom in the check below | Cause                                   | Fix                                                  |
| -------------------------- | --------------------------------------- | ---------------------------------------------------- |
| `NOT EXPOSED`              | Dashboard setting                       | Settings → API → Exposed schemas — add all seventeen |
| `EXPOSED BUT NOT GRANTED`  | Migration `0008_grants.sql` did not run | Re-run `supabase db push`                            |

Run the preflight before you debug anything else:

```bash
npm run check:hosted -- https://YOUR-PROJECT.supabase.co YOUR_ANON_KEY
```

It signs in as every email in `DEMO_PERSONAS` and reports the email and persona
role for any broken seeded account before checking each schema separately. It
also confirms that an anonymous caller
holding the publishable key gets nothing back from `core.teacher_profile`.
Finally, it proves Neha's increment recommendation exists but is hidden from
Vikram, and proves Gurpreet lacks `audit.read` and cannot read a known
third-party school audit row. Any leak exits non-zero. The command accepts only
the anon / publishable key and explicitly refuses a legacy service-role JWT.

The seventeen schemas:

```
public, core, regulatory, audit, competency, kpi, evidence, growth,
assessment, cpd, compliance, sqaaf, service, appraisal, pay, ai, privacy
```

---

## Steps

### 1. Create the Supabase project

Free tier is sufficient — 122 tables is well inside it. Note that a free
project **pauses after a week of inactivity**, which for an intermittently
demonstrated platform means the first visit after a quiet spell fails. If the
demo matters, that alone is the reason to be on a paid plan.

### 2. Push the schema from your Mac, not from Replit

The database is remote either way, and your Mac already has the CLI and a known
good repository.

```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

All 56 migrations are hosted-compatible: the only extensions are `pgcrypto` and
`citext`, both available, and nothing needs superuser. The evidence storage
bucket and its policies are created by migrations `0029` and `0048`, so there is
no bucket to create by hand.

### 3. Expose the schemas

Settings → API → Exposed schemas. Add all seventeen. See above for why this is
the step that decides whether anything works.

### 4. Close self-registration

`config.toml` is a **local-only** file. `enable_signup = false` in it does
nothing to a hosted project.

Authentication → Providers → Email → **disable "Allow new users to sign up"**.
Accounts here are provisioned by the school; a demo that anyone can register for
is a different product.

### 5. Seed the demo data

`supabase db push` applies migrations but **does not run `seed.sql`** — seeds
run only on a local `db reset`. Run it explicitly:

```bash
psql "postgresql://postgres.YOUR-REF:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" \
  -f supabase/seed.sql
```

The connection string is in Settings → Database. The seed creates its own
`auth.users` rows with hashed passwords, so the accounts work immediately.

**Everyone in it is fictional and every record is synthetic.** Never load real
teacher data into a demo project.

### 6. Import into Replit

If you are using the Replit Agent, paste the briefing in
[`REPLIT_AGENT_PROMPT.md`](REPLIT_AGENT_PROMPT.md) first. It exists because an
agent that finds this app rendering empty pages will reasonably conclude the
database is missing and offer to move it onto Replit's Postgres — which would
replace Row Level Security with application-level filtering and remove the
access boundary. The empty pages have a different cause, in step 3.

Import from GitHub, or push the repository and import it. `.replit` in the root
already sets Node 22, the build and run commands, and binds `0.0.0.0` — without
that last part Next starts, reports no error, and is unreachable through
Replit's proxy.

The Next.js configuration also reads Replit's injected `REPLIT_DEV_DOMAIN` and
adds it to `allowedDevOrigins`. This permits framework assets and hot reload
through the proxied development preview without copying a transient
`*.replit.dev` hostname into the repository. The setting only governs the Next
development server; it does not broaden the origins accepted by a production
deployment.

### 7. Set Replit Secrets

| Secret                          | Value                              |
| ------------------------------- | ---------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://YOUR-PROJECT.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The **anon / publishable** key     |
| `NEXT_PUBLIC_APP_URL`           | Your Replit deployment URL         |

**Do not set `SUPABASE_SERVICE_ROLE_KEY`.** It bypasses RLS entirely. It is
used in exactly one place — the seed — and never by application code. If it is
absent at runtime, anything that would misuse it fails loudly, which is the
behaviour you want.

**Do not set `DEMO_NO_LOGIN`.** See the warning below.

### 8. Deploy

Autoscale deployment. Build `npm run build`, run `npm run start`.

Next 16 builds are memory-hungry; if the build is killed, raise the deployment's
memory rather than reducing the app.

---

## The demo-login flag, on a public URL

`DEMO_NO_LOGIN=1` gives a password-free persona chooser. It is guarded by
`NODE_ENV !== 'production' && DEMO_NO_LOGIN === '1'`, so a Replit **deployment**
is safe: production builds refuse it whatever the secret says.

**A Replit dev session is not a production build.** If you set that secret and
press Run, the development server serves a public `*.replit.dev` URL with a
no-login door on it. Anyone with the link becomes the Principal.

The data is fictional, so this is embarrassing rather than dangerous — but it is
exactly the "staging box with a copied environment file" case the guard was
written for, and Replit's dev URLs are public by default.

**Recommendation: leave the flag unset and hand out the demo credentials.** They
are fictional accounts with a password named
`demo-password-not-for-production`. If you want a link with no credentials at
all, put Replit's own access control in front of the whole app rather than
opening a door inside it.

---

## Verifying the deployment

Run the read-only hosted check after migrations and seed data have been applied,
and again immediately before showing or deploying the application to a school:

```bash
npm run check:hosted -- https://YOUR-PROJECT.supabase.co YOUR_ANON_KEY
```

The command must finish with `All schemas reachable; anonymous and sensitive
role boundaries are intact.` A `FAIL` or non-zero exit blocks deployment.

For a manual browser spot-check when authorization or role assignments changed:

1. Sign in as `neha.sharma@demo-school.example` — the dashboard should show
   figures, not empty panels. Empty panels mean step 3.
2. Sign in as `vikram.rao@demo-school.example` and open `/increment` — he
   supervises Neha's entire development and must see nothing of her pay
   position.
3. Sign in as `gurpreet.dhillon@demo-school.example` and open `/admin/audit` —
   the Principal does **not** hold `audit.read` and must be refused.

If all three behave, RLS and the permission model survived the move. If the
first works and the others do not behave as described, the grants ran but
something is wrong with role assignment — check the seed completed.

---

## What does not come with you

| Local only                | Why                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `supabase/config.toml`    | Local stack configuration. Its auth settings are dashboard settings on hosted.                                           |
| `scripts/local-postgres/` | The no-Docker Postgres shim, for tests.                                                                                  |
| The Playwright suite      | Drives the real lifecycle and is not idempotent. Run it locally against a local reset, never against the hosted project. |
| `PREVIEW_DATABASE_URL`    | Development-only direct-Postgres path.                                                                                   |
| `DEMO_NO_LOGIN`           | See above.                                                                                                               |

---

## Cost and limits, honestly

Free Supabase plus a Replit Autoscale deployment will run this demo. The two
things that will bite are the free project pausing after a week of inactivity,
and Next 16 build memory on a small Replit instance.

Neither is a reason to change the architecture. Both are a reason to be on paid
tiers before showing it to a school.
