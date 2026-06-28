#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Applying Phase 12 validation and security update..."
cp -R "$PATCH_DIR/backend/src" "$ROOT_DIR/backend/"
cp -R "$PATCH_DIR/backend/prisma" "$ROOT_DIR/backend/"
cp -R "$PATCH_DIR/backend/docs" "$ROOT_DIR/backend/"

echo "Phase 12 files copied."
echo "Next commands:"
echo "cd backend"
echo "npx prisma migrate dev --name validation_security_rules"
echo "npx prisma generate"
echo "npm run build"
