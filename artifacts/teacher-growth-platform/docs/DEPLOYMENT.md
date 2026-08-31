# Deployment

For deploying a single CBSE-affiliated school. Read
[`SECURITY.md`](SECURITY.md) before running this with real teacher data — the
pre-production checklist there is not optional.

---

## What this needs

|          | Requirement                                                                                |
| -------- | ------------------------------------------------------------------------------------------ |
| Runtime  | Node 22 LTS (see `.nvmrc`)                                                                 |
| Database | PostgreSQL 15+ with Supabase (PostgREST, GoTrue, Storage)                                  |
| Region   | **India, unless a deliberate decision is recorded otherwise** — see _Data residency_ below |
| TLS      | Required. There is no reason to run this over plain HTTP.                                  |

---

## Data residency

The DPDP Act, 2023 permits transfer outside India except to territories the
Central Government restricts. That is a permission, not a recommendation, and
the school is answering to its own staff.

`.env.example` carries a residency guard. Record the chosen region explicitly
rather than accepting a provider default — "wherever the platform put it" is not
an answer a school should have to give a teacher.

Choose an Indian region unless there is a recorded reason not to.

---

## Environment

Copy `.env.example` to `.env.local` and fill it in. Never commit real values.

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # seeding only — see below
NEXT_PUBLIC_APP_URL
```

**`SUPABASE_SERVICE_ROLE_KEY` must not be present in the deployed
application's runtime environment.** It bypasses Row Level Security entirely.
It is used in exactly one place — the seed — and is never imported into
application code. If it is absent at runtime, anything that would misuse it
fails loudly, which is the behaviour you want.

---

## Deploying

### 1. Database

Apply migrations in order. There are 56.

```bash
npx supabase db push
```

**Do not run `db reset` against a database with real data.** It drops
everything.

### 2. Auth configuration

```toml
[auth]
enable_signup = false
```

Accounts are provisioned by the school. Note the trap: `[auth.email]
enable_signup` maps to GoTrue's `EXTERNAL_EMAIL_ENABLED` and disables the whole
email provider rather than closing registration.

### 3. Provision the school

`core.school` is empty after migrations — the school is created by the seed, not
by a migration. School-scoped provisioning is therefore a **function the seed
calls**, and a migration that loops over `core.school` does nothing on a fresh
database.

For a real deployment, write a provisioning script modelled on
`supabase/seed.sql` that creates the school, calls
`core.provision_school_roles()` and `privacy.provision_retention()`, and creates
real accounts — **without any demo data**.

### 4. Application

```bash
npm ci
npm run build
npm run start
```

**Never run `next build` while a dev server is running.** It clobbers `.next`
and every route then throws `__webpack_modules__[moduleId] is not a function`.

### 5. Storage

Create the evidence bucket, private, with the policies from the migrations.
Uploads are gated on malware-scan status; wire a scanner to set it, or evidence
files will never become readable.

---

## Local development

Docker Desktop needs an administrator password; **colima** does not, and is what
this project was verified against.

```bash
colima start --vm-type vz --vz-rosetta --cpu 4 --memory 6 --disk 60
```

```bash
npm run db:start
npm run db:reset
npm run dev
```

If `supabase start` hangs, use:

```bash
npm run db:bootstrap
```

**Why it hangs:** adding a schema to `config.toml` before its migration has run
makes PostgREST fail its health check, and the stack never comes up. The
bootstrap script starts without the new schema, resets, then adds it and
restarts.

A `config.toml` schema change needs a full `supabase stop && supabase start`,
not a `db reset`.

For database tests without Docker, a PostgreSQL 15 shim runs on port 55432:

```bash
./scripts/local-postgres/run.sh start
./scripts/local-postgres/run.sh reapply
```

---

## Verification

```bash
npm run check          # lint, typecheck, 456 unit and database tests
npm run test:e2e:clean # resets the database, runs 62 Playwright specs
npm run build          # production build
npm audit              # 0 vulnerabilities at Stage 6
```

**The E2E suite is not idempotent.** It drives the real lifecycle, so a second
run against the same database fails on a strict-mode violation that looks
exactly like a regression. Always reset first. `test:e2e:clean` does this.

Playwright runs `fullyParallel: false, workers: 1`. `describe.configure({ mode:
'serial' })` only orders within a file, and the suites share a database.
`zz-acceptance.spec.ts` is named to run last, deliberately: it asserts the
finished state of the lifecycle the other suites drive.

---

## Backups

- Point-in-time recovery on the Postgres instance.
- Storage bucket backed up separately — evidence files are not in the database.
- **Restore-test them.** An untested backup is not a backup. Restore into a
  scratch project and run `npm run check` against it; the database tests will
  tell you whether constraints, triggers and policies survived.

Retention of backups is itself a privacy question. See
[`PRIVACY.md`](PRIVACY.md) — a backup that outlives the retention period of the
data in it is a gap, and the retention periods are not yet set.

---

## Upgrades

1. Apply migrations first, application second. Migrations are additive and
   forward-only.
2. Run `npm run check` against a copy of production data before deploying.
3. Never edit a migration that has been applied. Write a new one.

### Known deprecation

Next 16 deprecates the `middleware` file convention in favour of `proxy`. The
build warns. `src/middleware.ts` carries the session refresh and the CSP nonce,
so the rename is not purely mechanical and has been deferred rather than done
carelessly. It will need doing before the convention is removed.

---

## Monitoring

Watch:

- **Failed sign-ins** — the rate limiter is in-process, so a distributed attempt
  will not show as one spike.
- **`audit.audit_log` growth** — a sudden change in volume is worth a look.
- **`privacy.access_log`** — repeated access to one teacher's file by someone
  with no supervisory relationship to them.
- **Storage growth** — evidence files are the only unbounded thing here.

---

## Rollback

Application: redeploy the previous build.

Database: **restore from backup.** There are no down-migrations. Several
migrations are not reversible without data loss — append-only trails, supersede
chains and deferred constraints do not unwind cleanly, and a partial rollback of
an append-only table is worse than none.

Test the restore path before you need it.
