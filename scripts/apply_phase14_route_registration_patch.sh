#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INDEX_FILE="src/routes/index.ts"
APP_FILE="src/app.ts"

if [ ! -f "$INDEX_FILE" ] && [ ! -f "$APP_FILE" ]; then
  echo "Could not find src/routes/index.ts or src/app.ts. Copy diagnosticPlatform.routes.ts manually and register it under /api." >&2
  exit 1
fi

echo "Phase 14 files copied. Now register diagnosticPlatformRoutes in your central router."

echo ""
echo "Recommended registration if src/routes/index.ts exports an Express router mounted under /api:"
echo "  import diagnosticPlatformRoutes from './diagnosticPlatform.routes';"
echo "  router.use('/', diagnosticPlatformRoutes);"

echo ""
echo "Recommended registration if src/app.ts registers routes directly:"
echo "  import diagnosticPlatformRoutes from './routes/diagnosticPlatform.routes';"
echo "  app.use('/api', diagnosticPlatformRoutes);"

echo ""
echo "After registration, run:"
echo "  npm run build"
echo "  npx tsx scripts/phase14_route_integrity_check.ts"
echo "  API_BASE_URL=http://localhost:4000/api API_TOKEN=<JWT> FACILITY_ID=<facilityId> npx tsx scripts/phase14_http_smoke_test.ts"
