#!/usr/bin/env bash
#
# verify-build.sh — reproducible backend build verification.
#
# This script encodes the ONE correct build order for this project. The Prisma
# client MUST be generated before any TypeScript build or typecheck, because the
# generated client is the source of every Prisma enum/model type the code imports.
# Skipping generation produces ~150 misleading "@prisma/client has no exported
# member" errors plus a cascade of implicit-any and narrowing failures — none of
# which are real source bugs. Running the steps in this order avoids that trap.
#
# Requirements: network access to binaries.prisma.sh on first run (to download
# the Prisma query engine). If your host blocks it, allowlist that endpoint or
# pre-seed node_modules/.prisma.
#
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> [1/4] Installing dependencies (npm ci)"
npm ci

echo "==> [2/4] Generating Prisma client (REQUIRED before build)"
npx prisma generate

echo "==> [3/4] Typechecking (tsc --noEmit)"
npm run typecheck

echo "==> [4/4] Building (tsc)"
npm run build

echo ""
echo "Backend build verified successfully."
