#!/usr/bin/env bash
#
# Prepares a hosted Supabase project: migrations, seed, and a preflight.
#
# Run this from your Mac, not from Replit — the database is remote either way,
# and this machine already has the CLI and a known-good repository.
#
#   ./scripts/deploy-hosted.sh <project-ref>
#
# It will ask for the database password (Settings → Database) and the anon key
# (Settings → API). Neither is stored.

set -euo pipefail

REF="${1:-}"
if [ -z "$REF" ]; then
  echo "Usage: ./scripts/deploy-hosted.sh <project-ref>" >&2
  echo "The ref is the subdomain of your project URL: https://<ref>.supabase.co" >&2
  exit 2
fi

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/5  Linking to $REF"
npx supabase link --project-ref "$REF"

say "2/5  Applying 56 migrations"
npx supabase db push

say "3/5  Checking this project is safe to seed"
read -rsp "  Database password: " DB_PASSWORD; echo
CONN="postgresql://postgres.${REF}:${DB_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"

# The seed loads a fictional school. Running it into a project that holds a real
# school's records would mix synthetic data into real ones, which is not
# something you would notice quickly or be able to unpick later.
REAL=$(psql "$CONN" -tAc \
  "select count(*) from core.app_user where email not like '%@demo-school.example'" 2>/dev/null || echo "unreadable")

if [ "$REAL" = "unreadable" ]; then
  echo "  Could not read core.app_user. Check the password and the region in the" >&2
  echo "  connection string above — pooler hosts differ by region." >&2
  exit 1
fi

if [ "$REAL" != "0" ]; then
  echo "  REFUSING TO SEED: this project already holds $REAL account(s) outside" >&2
  echo "  @demo-school.example. That looks like a real school, and the demo seed" >&2
  echo "  would mix fictional records into it." >&2
  exit 1
fi

say "4/5  Seeding the demo school (23 fictional staff)"
psql "$CONN" -f supabase/seed.sql >/dev/null
echo "  seeded"

say "5/5  Preflight"
read -rp "  Anon (publishable) key: " ANON_KEY
node scripts/check-hosted.mjs "https://${REF}.supabase.co" "$ANON_KEY"

cat <<DONE

Database is ready. Three things remain, and none of them can be done from here
because they are dashboard settings:

  1. Settings → API → Exposed schemas
     Add all seventeen. Without this every page renders EMPTY and nothing
     errors. If the preflight above reported NOT EXPOSED, this is why.

     public, core, regulatory, audit, competency, kpi, evidence, growth,
     assessment, cpd, compliance, sqaaf, service, appraisal, pay, ai, privacy

  2. Authentication → Providers → Email
     Turn OFF "Allow new users to sign up". config.toml is local-only and does
     nothing here.

  3. Replit → Secrets
     NEXT_PUBLIC_SUPABASE_URL      https://${REF}.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY <the anon key>
     NEXT_PUBLIC_APP_URL           <your Replit URL>

     Do NOT set SUPABASE_SERVICE_ROLE_KEY. Do NOT set DEMO_NO_LOGIN.

Then re-run the preflight until it is green:

  npm run check:hosted -- https://${REF}.supabase.co <anon-key>

DONE
