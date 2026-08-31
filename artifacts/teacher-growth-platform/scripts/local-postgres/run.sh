#!/usr/bin/env bash
# ===========================================================================
# Local PostgreSQL harness — for machines without Docker
# ===========================================================================
# `supabase start` requires Docker. Where Docker is unavailable, this runs the
# migrations against a plain PostgreSQL server plus scripts/local-postgres/
# supabase-shim.sql, which is enough to validate SQL, constraints, triggers and
# Row Level Security.
#
# It does NOT replace `supabase db reset` — there is no PostgREST, GoTrue,
# Storage or Realtime here. Use the real stack before shipping.
#
#   ./scripts/local-postgres/run.sh start     init cluster, apply migrations + seed
#   ./scripts/local-postgres/run.sh psql      open a shell against it
#   ./scripts/local-postgres/run.sh reapply   drop and rebuild the database
#   ./scripts/local-postgres/run.sh stop      stop the server
#
# Requires initdb/pg_ctl/psql on PATH. Without them, a no-sudo install is:
#   curl -sSL https://micro.mamba.pm/api/micromamba/osx-arm64/latest \
#     | tar -xj bin/micromamba
#   ./bin/micromamba create -y -p ~/.local/pg15 -c conda-forge postgresql=15
# ===========================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-$HOME/.local/pg15/bin}"
DATA="${PGDATA_DIR:-$ROOT/.localdb}"
PORT="${PGPORT:-55432}"
DB="${PGDATABASE:-tgp}"

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres PGDATABASE="$DB"

bin() { echo "${PGBIN%/}/$1"; }

require_tools() {
  for t in initdb pg_ctl psql; do
    [ -x "$(bin $t)" ] || { echo "error: $(bin $t) not found. Set PGBIN." >&2; exit 1; }
  done
}

apply() {
  echo "--> shim"
  "$(bin psql)" -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/local-postgres/supabase-shim.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "--> $(basename "$f")"
    "$(bin psql)" -v ON_ERROR_STOP=1 -q -f "$f"
  done
  echo "--> seed.sql"
  "$(bin psql)" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/seed.sql"
  echo "done."
}

case "${1:-start}" in
  start)
    require_tools
    if [ ! -d "$DATA" ]; then
      echo "--> initdb $DATA"
      "$(bin initdb)" -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
    fi
    # TCP loopback rather than a unix socket: socket paths are capped at 103
    # bytes and a deep checkout easily exceeds it.
    if "${PGBIN%/}/pg_isready" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
      echo "server already running on port $PORT"
    else
      "$(bin pg_ctl)" -D "$DATA" \
        -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
        -l "$DATA/server.log" -w start
    fi
    "$(bin psql)" -d postgres -tAc \
      "select 1 from pg_database where datname='$DB'" | grep -q 1 \
      || "$(bin psql)" -d postgres -q -c "create database $DB;"
    # Migrations are not idempotent (CREATE TYPE, CREATE TABLE). Re-running them
    # over a populated database fails noisily, so only apply to a fresh one.
    if "$(bin psql)" -tAc \
         "select 1 from information_schema.schemata where schema_name='core'" | grep -q 1; then
      echo "schema already present — skipping apply. Use '$0 reapply' to rebuild."
    else
      apply
    fi
    echo "connect: PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres psql -d $DB"
    ;;
  reapply)
    require_tools
    "$(bin psql)" -d postgres -q -c "drop database if exists $DB;"
    "$(bin psql)" -d postgres -q -c "create database $DB;"
    apply
    ;;
  psql)
    require_tools
    exec "$(bin psql)" -d "$DB"
    ;;
  stop)
    require_tools
    "$(bin pg_ctl)" -D "$DATA" -w stop
    ;;
  *)
    echo "usage: $0 {start|reapply|psql|stop}" >&2
    exit 1
    ;;
esac
