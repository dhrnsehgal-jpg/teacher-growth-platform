#!/usr/bin/env bash
# Bootstraps the local Supabase stack when config.toml exposes a schema that
# does not exist yet.
#
# PostgREST health-checks its schema list at startup, but migrations only run on
# `db reset`, which needs the stack up. Adding a new schema to config.toml
# therefore wedges `supabase start` with "schema ... does not exist".
#
# This does the dance: start with only the schemas that exist, reset to create
# the rest, then restart with the full list.
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG=supabase/config.toml
BACKUP=$(mktemp)
cp "$CONFIG" "$BACKUP"
trap 'cp "$BACKUP" "$CONFIG"; rm -f "$BACKUP"' EXIT

echo "==> starting with the built-in schemas only"
/usr/bin/sed -i '' 's/^schemas = .*/schemas = ["public"]/' "$CONFIG"
npx supabase start >/dev/null

echo "==> applying migrations"
npx supabase db reset >/dev/null

echo "==> restarting with every schema exposed"
cp "$BACKUP" "$CONFIG"
npx supabase stop >/dev/null
npx supabase start >/dev/null

echo "==> ready"
