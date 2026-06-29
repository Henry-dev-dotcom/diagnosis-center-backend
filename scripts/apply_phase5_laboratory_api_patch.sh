#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(pwd)"

if [ ! -d "$PROJECT_ROOT/src" ]; then
  echo "Run this script from your backend project root, for example: cd backend && bash ../backend/scripts/apply_phase5_laboratory_api_patch.sh"
  exit 1
fi

copy_file() {
  local source="$1"
  local target="$2"
  mkdir -p "$(dirname "$target")"
  if [ -f "$target" ]; then
    cp "$target" "$target.phase5.bak"
  fi
  cp "$source" "$target"
  echo "Updated $target"
}

copy_file "$PATCH_DIR/src/types/labWorkflow.types.ts" "$PROJECT_ROOT/src/types/labWorkflow.types.ts"
copy_file "$PATCH_DIR/src/utils/labWorkflow.utils.ts" "$PROJECT_ROOT/src/utils/labWorkflow.utils.ts"
copy_file "$PATCH_DIR/src/services/labWorkflow.service.ts" "$PROJECT_ROOT/src/services/labWorkflow.service.ts"
copy_file "$PATCH_DIR/src/controllers/labWorkflow.controller.ts" "$PROJECT_ROOT/src/controllers/labWorkflow.controller.ts"
copy_file "$PATCH_DIR/src/validators/labWorkflow.validators.ts" "$PROJECT_ROOT/src/validators/labWorkflow.validators.ts"
copy_file "$PATCH_DIR/src/routes/labWorkflow.routes.ts" "$PROJECT_ROOT/src/routes/labWorkflow.routes.ts"

mkdir -p "$PROJECT_ROOT/docs"
cp "$PATCH_DIR/docs/PHASE_5_LABORATORY_API_REFINEMENT.md" "$PROJECT_ROOT/docs/PHASE_5_LABORATORY_API_REFINEMENT.md"

echo "Phase 5 laboratory API refinement files copied."
echo "Now confirm your upload middleware is connected before the document route, then run: npm run build"
