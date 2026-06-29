#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Export DATABASE_URL before running this seed." >&2
  exit 1
fi

if command -v psql >/dev/null 2>&1; then
  echo "Applying Phase 13 SQL seed with psql..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/seeds/phase13_multi_facility_demo.seed.sql
else
  echo "psql not found. Falling back to tsx/ts-node Prisma runner..."
  if command -v npx >/dev/null 2>&1; then
    npx tsx prisma/seed.phase13.ts
  else
    echo "npx is not available. Install PostgreSQL client or run: npx tsx prisma/seed.phase13.ts" >&2
    exit 1
  fi
fi

echo "Phase 13 seed data applied successfully."
