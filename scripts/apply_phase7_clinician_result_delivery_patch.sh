#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Applying Phase 7 clinician result delivery patch into: ${ROOT_DIR}"
cp -R "${PATCH_DIR}/backend/src" "${ROOT_DIR}/backend/"
cp -R "${PATCH_DIR}/backend/prisma/migrations/20260628135403_clinician_result_delivery_refinement" "${ROOT_DIR}/backend/prisma/migrations/"
cp -R "${PATCH_DIR}/backend/docs" "${ROOT_DIR}/backend/"

echo "Phase 7 patch copied. Register backend/src/routes/clinicianResultDelivery.routes.ts in routes/index.ts."
echo "Then run: cd backend && npx prisma migrate dev --name clinician_result_delivery_refinement && npx prisma generate && npm run build"
