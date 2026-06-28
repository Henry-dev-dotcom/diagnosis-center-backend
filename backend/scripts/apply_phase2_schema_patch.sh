#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
SCHEMA_FILE="$ROOT_DIR/backend/prisma/schema.prisma"
EXTENSION_FILE="$ROOT_DIR/backend/prisma/extensions/phase2_schema_extension.prisma"

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "schema.prisma not found at $SCHEMA_FILE"
  echo "Run this script from the project root, or pass the project root as the first argument."
  exit 1
fi

if grep -q "model DiagnosticFacility" "$SCHEMA_FILE"; then
  echo "Phase 2 schema models already appear to be present. Skipping append."
else
  cat "$EXTENSION_FILE" >> "$SCHEMA_FILE"
  echo "Phase 2 schema models appended to $SCHEMA_FILE"
fi

echo "Next: manually add facilityId fields from backend/prisma/extensions/existing_model_field_additions.prisma.txt to existing models, then run:"
echo "  cd backend"
echo "  npx prisma format"
echo "  npx prisma migrate dev --name multi_facility_workflow_schema"
echo "  npx prisma generate"
