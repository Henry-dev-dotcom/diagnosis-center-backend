#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Applying Phase 10 Admin Facilities API patch into: $ROOT_DIR"
cp -R "$PATCH_DIR/backend/src/constants" "$ROOT_DIR/backend/src/"
cp -R "$PATCH_DIR/backend/src/types" "$ROOT_DIR/backend/src/"
cp -R "$PATCH_DIR/backend/src/utils" "$ROOT_DIR/backend/src/"
cp -R "$PATCH_DIR/backend/src/services" "$ROOT_DIR/backend/src/"
cp -R "$PATCH_DIR/backend/src/controllers" "$ROOT_DIR/backend/src/"
cp -R "$PATCH_DIR/backend/src/validators" "$ROOT_DIR/backend/src/"
cp -R "$PATCH_DIR/backend/src/routes" "$ROOT_DIR/backend/src/"
cp -R "$PATCH_DIR/backend/prisma/migrations" "$ROOT_DIR/backend/prisma/"
cp -R "$PATCH_DIR/backend/docs" "$ROOT_DIR/backend/"

echo "Phase 10 files copied. Register facilityManagementRoutes in your backend route index."
