#!/usr/bin/env bash
set -euo pipefail

PATCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_ROOT="${1:-$(pwd)}"

echo "Applying Phase 11 notifications and audit workflow patch..."
echo "Patch root: $PATCH_ROOT"
echo "Project root: $PROJECT_ROOT"

cp -R "$PATCH_ROOT/backend/src/constants/." "$PROJECT_ROOT/src/constants/"
cp -R "$PATCH_ROOT/backend/src/types/." "$PROJECT_ROOT/src/types/"
cp -R "$PATCH_ROOT/backend/src/utils/." "$PROJECT_ROOT/src/utils/"
cp -R "$PATCH_ROOT/backend/src/services/." "$PROJECT_ROOT/src/services/"
cp -R "$PATCH_ROOT/backend/src/controllers/." "$PROJECT_ROOT/src/controllers/"
cp -R "$PATCH_ROOT/backend/src/routes/." "$PROJECT_ROOT/src/routes/"
cp -R "$PATCH_ROOT/backend/src/validators/." "$PROJECT_ROOT/src/validators/"
mkdir -p "$PROJECT_ROOT/prisma/migrations/20260628140903_notifications_audit_workflow_tracking"
cp "$PATCH_ROOT/backend/prisma/migrations/20260628140903_notifications_audit_workflow_tracking/migration.sql" "$PROJECT_ROOT/prisma/migrations/20260628140903_notifications_audit_workflow_tracking/migration.sql"
mkdir -p "$PROJECT_ROOT/prisma/extensions"
cp -R "$PATCH_ROOT/backend/prisma/extensions/." "$PROJECT_ROOT/prisma/extensions/"
mkdir -p "$PROJECT_ROOT/docs"
cp -R "$PATCH_ROOT/backend/docs/." "$PROJECT_ROOT/docs/"

echo "Phase 11 files copied. Register routes and run Prisma migration/build."
