#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "Applying Phase 9 scan workflow refinement..."
npx prisma migrate dev --name scan_workflow_refinement
npx prisma generate
npm run build

echo "Phase 9 scan workflow refinement applied successfully."
