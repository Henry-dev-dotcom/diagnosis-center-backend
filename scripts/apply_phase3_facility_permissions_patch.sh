#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [ ! -d "$ROOT_DIR/backend/src" ]; then
  echo "backend/src not found. Run from project root or pass project root as the first argument."
  exit 1
fi

mkdir -p "$ROOT_DIR/backend/src/constants" "$ROOT_DIR/backend/src/types" "$ROOT_DIR/backend/src/utils" "$ROOT_DIR/backend/src/services" "$ROOT_DIR/backend/src/middleware" "$ROOT_DIR/backend/src/routes" "$ROOT_DIR/backend/docs"

cp -R "$PATCH_DIR/backend/src/constants/"* "$ROOT_DIR/backend/src/constants/"
cp -R "$PATCH_DIR/backend/src/types/"* "$ROOT_DIR/backend/src/types/"
cp -R "$PATCH_DIR/backend/src/utils/"* "$ROOT_DIR/backend/src/utils/"
cp -R "$PATCH_DIR/backend/src/services/"* "$ROOT_DIR/backend/src/services/"
cp -R "$PATCH_DIR/backend/src/middleware/"* "$ROOT_DIR/backend/src/middleware/"
cp -R "$PATCH_DIR/backend/src/routes/"* "$ROOT_DIR/backend/src/routes/"
cp -R "$PATCH_DIR/backend/docs/"* "$ROOT_DIR/backend/docs/"

echo "Phase 3 permission/scoping files copied."
echo "Next: wire attachFacilityScope and feature/role guards into your existing route files."
echo "Suggested check: cd backend && npm run build"
