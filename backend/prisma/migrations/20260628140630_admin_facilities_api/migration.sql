-- Phase 10 Admin Facilities API support
-- The core DiagnosticFacility tables are added in Phase 2.
-- This migration only adds safety indexes and default routing data where supported.

CREATE INDEX IF NOT EXISTS "DiagnosticFacility_status_idx" ON "DiagnosticFacility"("status");
CREATE INDEX IF NOT EXISTS "DiagnosticFacility_type_idx" ON "DiagnosticFacility"("type");
CREATE INDEX IF NOT EXISTS "DiagnosticFacility_city_region_idx" ON "DiagnosticFacility"("city", "region");
CREATE INDEX IF NOT EXISTS "FacilityServiceCatalog_facility_type_active_idx" ON "FacilityServiceCatalog"("facilityId", "serviceType", "isActive");
CREATE INDEX IF NOT EXISTS "FacilityUserAssignment_facility_status_idx" ON "FacilityUserAssignment"("facilityId", "status");
CREATE INDEX IF NOT EXISTS "FacilityRoutingRule_facility_type_enabled_idx" ON "FacilityRoutingRule"("facilityId", "requestType", "isEnabled");

-- Create default direct-result routing rules for existing facilities if none exist.
INSERT INTO "FacilityRoutingRule" (
  "id", "facilityId", "sourceRole", "requestType", "targetDepartment", "resultRecipient",
  "requiresReceptionPush", "isEnabled", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  f."id",
  'CLINICIAN',
  'LAB',
  'laboratory',
  'CLINICIAN',
  false,
  true,
  NOW(),
  NOW()
FROM "DiagnosticFacility" f
WHERE NOT EXISTS (
  SELECT 1 FROM "FacilityRoutingRule" r
  WHERE r."facilityId" = f."id" AND r."requestType" = 'LAB' AND r."sourceRole" = 'CLINICIAN'
);

INSERT INTO "FacilityRoutingRule" (
  "id", "facilityId", "sourceRole", "requestType", "targetDepartment", "resultRecipient",
  "requiresReceptionPush", "isEnabled", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  f."id",
  'RECEPTIONIST',
  'LAB',
  'laboratory',
  'CLINICIAN',
  false,
  true,
  NOW(),
  NOW()
FROM "DiagnosticFacility" f
WHERE NOT EXISTS (
  SELECT 1 FROM "FacilityRoutingRule" r
  WHERE r."facilityId" = f."id" AND r."requestType" = 'LAB' AND r."sourceRole" = 'RECEPTIONIST'
);

INSERT INTO "FacilityRoutingRule" (
  "id", "facilityId", "sourceRole", "requestType", "targetDepartment", "resultRecipient",
  "requiresReceptionPush", "isEnabled", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  f."id",
  'CLINICIAN',
  'SCAN',
  'radiology',
  'CLINICIAN',
  false,
  true,
  NOW(),
  NOW()
FROM "DiagnosticFacility" f
WHERE NOT EXISTS (
  SELECT 1 FROM "FacilityRoutingRule" r
  WHERE r."facilityId" = f."id" AND r."requestType" = 'SCAN' AND r."sourceRole" = 'CLINICIAN'
);

INSERT INTO "FacilityRoutingRule" (
  "id", "facilityId", "sourceRole", "requestType", "targetDepartment", "resultRecipient",
  "requiresReceptionPush", "isEnabled", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  f."id",
  'RECEPTIONIST',
  'SCAN',
  'radiology',
  'CLINICIAN',
  false,
  true,
  NOW(),
  NOW()
FROM "DiagnosticFacility" f
WHERE NOT EXISTS (
  SELECT 1 FROM "FacilityRoutingRule" r
  WHERE r."facilityId" = f."id" AND r."requestType" = 'SCAN' AND r."sourceRole" = 'RECEPTIONIST'
);
