#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Applying Phase 8 reception workflow patch into: ${ROOT_DIR}"
cp -R "${PATCH_DIR}/backend/src" "${ROOT_DIR}/backend/"
cp -R "${PATCH_DIR}/backend/prisma/migrations/20260628135656_reception_direct_routing_refinement" "${ROOT_DIR}/backend/prisma/migrations/"
cp -R "${PATCH_DIR}/backend/docs" "${ROOT_DIR}/backend/"

echo "Phase 8 patch copied. Register backend/src/routes/receptionWorkflow.routes.ts in routes/index.ts."
echo "Then run: cd backend && npx prisma migrate dev --name reception_direct_routing_refinement && npx prisma generate && npm run build"
