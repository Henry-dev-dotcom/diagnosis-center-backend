#!/usr/bin/env bash
set -euo pipefail

PATCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_ROOT="${1:-$(pwd)}"
BACKEND_ROOT="$PROJECT_ROOT/backend"

if [ ! -d "$BACKEND_ROOT/src" ]; then
  echo "Could not find backend/src under $BACKEND_ROOT"
  echo "Usage: bash backend/scripts/apply_phase6_result_documents_patch.sh /path/to/project-root"
  exit 1
fi

copy_file() {
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  echo "Copied $(basename "$src") -> $dest"
}

copy_file "$PATCH_ROOT/backend/src/constants/resultDocument.constants.ts" "$BACKEND_ROOT/src/constants/resultDocument.constants.ts"
copy_file "$PATCH_ROOT/backend/src/types/resultDocument.types.ts" "$BACKEND_ROOT/src/types/resultDocument.types.ts"
copy_file "$PATCH_ROOT/backend/src/utils/resultDocument.utils.ts" "$BACKEND_ROOT/src/utils/resultDocument.utils.ts"
copy_file "$PATCH_ROOT/backend/src/middleware/resultDocumentUpload.middleware.ts" "$BACKEND_ROOT/src/middleware/resultDocumentUpload.middleware.ts"
copy_file "$PATCH_ROOT/backend/src/validators/resultDocument.validators.ts" "$BACKEND_ROOT/src/validators/resultDocument.validators.ts"
copy_file "$PATCH_ROOT/backend/src/services/resultDocument.service.ts" "$BACKEND_ROOT/src/services/resultDocument.service.ts"
copy_file "$PATCH_ROOT/backend/src/controllers/resultDocument.controller.ts" "$BACKEND_ROOT/src/controllers/resultDocument.controller.ts"
copy_file "$PATCH_ROOT/backend/src/routes/resultDocument.routes.ts" "$BACKEND_ROOT/src/routes/resultDocument.routes.ts"
copy_file "$PATCH_ROOT/backend/src/routes/phase6.routes.example.ts" "$BACKEND_ROOT/src/routes/phase6.routes.example.ts"

mkdir -p "$BACKEND_ROOT/prisma/migrations/20260628134953_result_document_storage"
copy_file "$PATCH_ROOT/backend/prisma/migrations/20260628134953_result_document_storage/migration.sql" "$BACKEND_ROOT/prisma/migrations/20260628134953_result_document_storage/migration.sql"
mkdir -p "$BACKEND_ROOT/prisma/extensions"
copy_file "$PATCH_ROOT/backend/prisma/extensions/phase6_document_model_field_additions.prisma.txt" "$BACKEND_ROOT/prisma/extensions/phase6_document_model_field_additions.prisma.txt"
copy_file "$PATCH_ROOT/backend/docs/PHASE_6_RESULT_DOCUMENT_UPLOADS.md" "$BACKEND_ROOT/docs/PHASE_6_RESULT_DOCUMENT_UPLOADS.md"

echo "Phase 6 files copied."
echo "Next: merge route registration from backend/src/routes/phase6.routes.example.ts into your main routes file."
echo "Then run: npm install multer @types/multer && npx prisma migrate dev --name result_document_storage && npx prisma generate && npm run build"
