#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${1:-.}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Applying Phase 4 workflow API patch to: ${PROJECT_ROOT}"

mkdir -p "${PROJECT_ROOT}/backend/src/constants" \
  "${PROJECT_ROOT}/backend/src/utils" \
  "${PROJECT_ROOT}/backend/src/validators" \
  "${PROJECT_ROOT}/backend/src/services" \
  "${PROJECT_ROOT}/backend/src/controllers" \
  "${PROJECT_ROOT}/backend/src/routes" \
  "${PROJECT_ROOT}/backend/docs"

cp -R "${SRC_DIR}/backend/src/constants/diagnosticWorkflow.constants.ts" "${PROJECT_ROOT}/backend/src/constants/"
cp -R "${SRC_DIR}/backend/src/utils/diagnosticWorkflow.utils.ts" "${PROJECT_ROOT}/backend/src/utils/"
cp -R "${SRC_DIR}/backend/src/validators/diagnosticWorkflow.validators.ts" "${PROJECT_ROOT}/backend/src/validators/"
cp -R "${SRC_DIR}/backend/src/services/diagnosticWorkflow.service.ts" "${PROJECT_ROOT}/backend/src/services/"
cp -R "${SRC_DIR}/backend/src/controllers/labWorkflow.controller.ts" "${PROJECT_ROOT}/backend/src/controllers/"
cp -R "${SRC_DIR}/backend/src/controllers/scanWorkflow.controller.ts" "${PROJECT_ROOT}/backend/src/controllers/"
cp -R "${SRC_DIR}/backend/src/controllers/receptionWorkflow.controller.ts" "${PROJECT_ROOT}/backend/src/controllers/"
cp -R "${SRC_DIR}/backend/src/controllers/clinicianResults.controller.ts" "${PROJECT_ROOT}/backend/src/controllers/"
cp -R "${SRC_DIR}/backend/src/routes/labWorkflow.routes.ts" "${PROJECT_ROOT}/backend/src/routes/"
cp -R "${SRC_DIR}/backend/src/routes/scanWorkflow.routes.ts" "${PROJECT_ROOT}/backend/src/routes/"
cp -R "${SRC_DIR}/backend/src/routes/receptionWorkflow.routes.ts" "${PROJECT_ROOT}/backend/src/routes/"
cp -R "${SRC_DIR}/backend/src/routes/clinicianResults.routes.ts" "${PROJECT_ROOT}/backend/src/routes/"
cp -R "${SRC_DIR}/backend/src/routes/phase4.routes.example.ts" "${PROJECT_ROOT}/backend/src/routes/"
cp -R "${SRC_DIR}/backend/docs/PHASE_4_WORKFLOW_API_UPDATE.md" "${PROJECT_ROOT}/backend/docs/"

echo "Phase 4 files copied. Now register the routes in backend/src/routes/index.ts using backend/src/routes/phase4.routes.example.ts."
echo "Then run: cd backend && npm run build"
