-- Optional default facility seed for development/testing.
-- Run after the Phase 2 migration if your database has no facility yet.

INSERT INTO "DiagnosticFacility" (
  "id", "name", "code", "type", "status", "country", "primaryColor", "secondaryColor", "notes"
)
VALUES (
  'default-facility',
  'Default Diagnostic Facility',
  'DEFAULT',
  'DIAGNOSTIC_CENTER',
  'ACTIVE',
  'Ghana',
  '#2f2925',
  '#efe5d5',
  'Default facility created for migration compatibility.'
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "FacilityFeature" ("facilityId", "featureKey", "isEnabled") VALUES
('default-facility', 'laboratory', true),
('default-facility', 'scanImaging', true),
('default-facility', 'billing', true),
('default-facility', 'clinicianPortal', true),
('default-facility', 'reception', true),
('default-facility', 'walkInRequests', true),
('default-facility', 'fileUpload', true),
('default-facility', 'resultDelivery', true),
('default-facility', 'reports', true),
('default-facility', 'notifications', true)
ON CONFLICT ("facilityId", "featureKey") DO NOTHING;

INSERT INTO "FacilityDepartment" ("facilityId", "departmentKey", "departmentName", "isEnabled") VALUES
('default-facility', 'laboratory', 'Laboratory', true),
('default-facility', 'radiology', 'Radiology / Imaging', true),
('default-facility', 'reception', 'Reception', true),
('default-facility', 'finance', 'Finance', true),
('default-facility', 'admin', 'Administration', true)
ON CONFLICT ("facilityId", "departmentKey") DO NOTHING;

INSERT INTO "FacilityRoutingRule" (
  "facilityId", "sourceRole", "requestType", "targetDepartment", "resultRecipient", "requiresReceptionPush", "isEnabled"
) VALUES
('default-facility', 'CLINICIAN', 'LAB', 'laboratory', 'CLINICIAN', false, true),
('default-facility', 'RECEPTIONIST', 'LAB', 'laboratory', 'CLINICIAN', false, true),
('default-facility', 'CLINICIAN', 'SCAN', 'radiology', 'CLINICIAN', false, true),
('default-facility', 'RECEPTIONIST', 'SCAN', 'radiology', 'CLINICIAN', false, true);

INSERT INTO "FacilityLimit" ("facilityId", "limitKey", "limitValue") VALUES
('default-facility', 'maxUsers', 50),
('default-facility', 'maxClinicians', 25),
('default-facility', 'maxDailyOrders', 500)
ON CONFLICT ("facilityId", "limitKey") DO NOTHING;
