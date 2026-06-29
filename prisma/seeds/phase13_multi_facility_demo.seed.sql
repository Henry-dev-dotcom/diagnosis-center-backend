-- Backend Phase 13: Multi-facility demo seed data
-- Run after Phases 2-12 migrations.
-- This script is idempotent and safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Facilities
-- -----------------------------------------------------------------------------
INSERT INTO "DiagnosticFacility" (
  "id", "name", "code", "type", "status", "phone", "email", "address",
  "city", "region", "country", "logoName", "primaryColor", "secondaryColor", "notes"
)
VALUES
  ('fac_sunkwa_main', 'Sunkwa Diagnostic Centre', 'SUNKWA-MAIN', 'DIAGNOSTIC_CENTER', 'ACTIVE', '+233 30 000 1000', 'info@sunkwadiagnostics.local', 'Main diagnostic facility', 'Accra', 'Greater Accra', 'Ghana', 'SUNKWA', '#2f2925', '#efe5d5', 'Default full-service facility for end-to-end workflow testing.'),
  ('fac_eastern_lab', 'Eastern Partner Laboratory', 'EASTERN-LAB', 'PARTNER_LAB', 'ACTIVE', '+233 30 000 2000', 'lab@easternpartner.local', 'Partner laboratory branch', 'Koforidua', 'Eastern Region', 'Ghana', 'EASTERN LAB', '#3b302a', '#f3eadc', 'Lab-only facility used to verify feature customization.'),
  ('fac_imaging_partner', 'Community Imaging Partner', 'IMG-PARTNER', 'IMAGING_CENTER', 'ACTIVE', '+233 30 000 3000', 'imaging@partner.local', 'Partner imaging facility', 'Kumasi', 'Ashanti Region', 'Ghana', 'IMAGING PARTNER', '#292929', '#eee2d0', 'Scan-only facility used to verify module restrictions.')
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "status" = EXCLUDED."status",
  "phone" = EXCLUDED."phone",
  "email" = EXCLUDED."email",
  "address" = EXCLUDED."address",
  "city" = EXCLUDED."city",
  "region" = EXCLUDED."region",
  "country" = EXCLUDED."country",
  "logoName" = EXCLUDED."logoName",
  "primaryColor" = EXCLUDED."primaryColor",
  "secondaryColor" = EXCLUDED."secondaryColor",
  "notes" = EXCLUDED."notes",
  "updatedAt" = CURRENT_TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 2. Features. Full facility gets all modules, lab-only and imaging-only are customized.
-- -----------------------------------------------------------------------------
WITH feature_seed(facility_code, feature_key, is_enabled, config) AS (
  VALUES
    ('SUNKWA-MAIN', 'clinician_portal', true, '{"home":"dashboard"}'::jsonb),
    ('SUNKWA-MAIN', 'reception', true, '{}'::jsonb),
    ('SUNKWA-MAIN', 'walk_in_requests', true, '{}'::jsonb),
    ('SUNKWA-MAIN', 'laboratory', true, '{"queueFlow":"step_window","acceptedSamples":true}'::jsonb),
    ('SUNKWA-MAIN', 'scan_imaging', true, '{"queueFlow":"step_window"}'::jsonb),
    ('SUNKWA-MAIN', 'billing', true, '{}'::jsonb),
    ('SUNKWA-MAIN', 'payments', true, '{}'::jsonb),
    ('SUNKWA-MAIN', 'file_uploads', true, '{"maxMb":15}'::jsonb),
    ('SUNKWA-MAIN', 'result_delivery', true, '{"recipient":"CLINICIAN","requiresReceptionPush":false}'::jsonb),
    ('SUNKWA-MAIN', 'reports', true, '{}'::jsonb),
    ('SUNKWA-MAIN', 'notifications', true, '{}'::jsonb),
    ('SUNKWA-MAIN', 'audit_logs', true, '{}'::jsonb),

    ('EASTERN-LAB', 'clinician_portal', true, '{}'::jsonb),
    ('EASTERN-LAB', 'reception', true, '{}'::jsonb),
    ('EASTERN-LAB', 'walk_in_requests', true, '{}'::jsonb),
    ('EASTERN-LAB', 'laboratory', true, '{"queueFlow":"step_window","acceptedSamples":true}'::jsonb),
    ('EASTERN-LAB', 'scan_imaging', false, '{"disabledReason":"Lab-only facility"}'::jsonb),
    ('EASTERN-LAB', 'billing', true, '{}'::jsonb),
    ('EASTERN-LAB', 'payments', true, '{}'::jsonb),
    ('EASTERN-LAB', 'file_uploads', true, '{"maxMb":15}'::jsonb),
    ('EASTERN-LAB', 'result_delivery', true, '{"recipient":"CLINICIAN","requiresReceptionPush":false}'::jsonb),
    ('EASTERN-LAB', 'reports', true, '{}'::jsonb),
    ('EASTERN-LAB', 'notifications', true, '{}'::jsonb),
    ('EASTERN-LAB', 'audit_logs', true, '{}'::jsonb),

    ('IMG-PARTNER', 'clinician_portal', true, '{}'::jsonb),
    ('IMG-PARTNER', 'reception', true, '{}'::jsonb),
    ('IMG-PARTNER', 'walk_in_requests', true, '{}'::jsonb),
    ('IMG-PARTNER', 'laboratory', false, '{"disabledReason":"Imaging-only facility"}'::jsonb),
    ('IMG-PARTNER', 'scan_imaging', true, '{"queueFlow":"step_window"}'::jsonb),
    ('IMG-PARTNER', 'billing', true, '{}'::jsonb),
    ('IMG-PARTNER', 'payments', true, '{}'::jsonb),
    ('IMG-PARTNER', 'file_uploads', true, '{"maxMb":25}'::jsonb),
    ('IMG-PARTNER', 'result_delivery', true, '{"recipient":"CLINICIAN","requiresReceptionPush":false}'::jsonb),
    ('IMG-PARTNER', 'reports', true, '{}'::jsonb),
    ('IMG-PARTNER', 'notifications', true, '{}'::jsonb),
    ('IMG-PARTNER', 'audit_logs', true, '{}'::jsonb)
)
INSERT INTO "FacilityFeature" ("id", "facilityId", "featureKey", "isEnabled", "config")
SELECT 'feat_' || lower(replace(f."code", '-', '_')) || '_' || feature_seed.feature_key,
       f."id", feature_seed.feature_key, feature_seed.is_enabled, feature_seed.config
FROM feature_seed
JOIN "DiagnosticFacility" f ON f."code" = feature_seed.facility_code
ON CONFLICT ("facilityId", "featureKey") DO UPDATE SET
  "isEnabled" = EXCLUDED."isEnabled",
  "config" = EXCLUDED."config",
  "updatedAt" = CURRENT_TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 3. Departments
-- -----------------------------------------------------------------------------
WITH department_seed(facility_code, department_key, department_name, is_enabled, config) AS (
  VALUES
    ('SUNKWA-MAIN', 'reception', 'Reception', true, '{}'::jsonb),
    ('SUNKWA-MAIN', 'laboratory', 'Laboratory', true, '{"sections":["Queue","Accepted Samples","Results"]}'::jsonb),
    ('SUNKWA-MAIN', 'radiology', 'Radiology / Scan Unit', true, '{"sections":["Queue","Accepted Scans","Results"]}'::jsonb),
    ('SUNKWA-MAIN', 'billing', 'Billing / Finance', true, '{}'::jsonb),
    ('SUNKWA-MAIN', 'admin', 'Administration', true, '{}'::jsonb),

    ('EASTERN-LAB', 'reception', 'Reception', true, '{}'::jsonb),
    ('EASTERN-LAB', 'laboratory', 'Laboratory', true, '{"sections":["Queue","Accepted Samples","Results"]}'::jsonb),
    ('EASTERN-LAB', 'radiology', 'Radiology / Scan Unit', false, '{"disabledReason":"No scan unit"}'::jsonb),
    ('EASTERN-LAB', 'billing', 'Billing / Finance', true, '{}'::jsonb),
    ('EASTERN-LAB', 'admin', 'Administration', true, '{}'::jsonb),

    ('IMG-PARTNER', 'reception', 'Reception', true, '{}'::jsonb),
    ('IMG-PARTNER', 'laboratory', 'Laboratory', false, '{"disabledReason":"No lab unit"}'::jsonb),
    ('IMG-PARTNER', 'radiology', 'Radiology / Scan Unit', true, '{"sections":["Queue","Accepted Scans","Results"]}'::jsonb),
    ('IMG-PARTNER', 'billing', 'Billing / Finance', true, '{}'::jsonb),
    ('IMG-PARTNER', 'admin', 'Administration', true, '{}'::jsonb)
)
INSERT INTO "FacilityDepartment" ("id", "facilityId", "departmentKey", "departmentName", "isEnabled", "config")
SELECT 'dept_' || lower(replace(f."code", '-', '_')) || '_' || department_seed.department_key,
       f."id", department_seed.department_key, department_seed.department_name, department_seed.is_enabled, department_seed.config
FROM department_seed
JOIN "DiagnosticFacility" f ON f."code" = department_seed.facility_code
ON CONFLICT ("facilityId", "departmentKey") DO UPDATE SET
  "departmentName" = EXCLUDED."departmentName",
  "isEnabled" = EXCLUDED."isEnabled",
  "config" = EXCLUDED."config",
  "updatedAt" = CURRENT_TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 4. Facility service catalog: lab and scan services customized per facility.
-- -----------------------------------------------------------------------------
WITH catalog_seed(facility_code, service_type, service_code, service_name, department_key, price, turnaround_hours, is_active, config) AS (
  VALUES
    ('SUNKWA-MAIN', 'LAB', 'FBC', 'Full Blood Count', 'laboratory', 80.00, 4, true, '{"referenceRange":"See differential report"}'::jsonb),
    ('SUNKWA-MAIN', 'LAB', 'MALARIA-RDT', 'Malaria Rapid Diagnostic Test', 'laboratory', 35.00, 1, true, '{"referenceRange":"Negative"}'::jsonb),
    ('SUNKWA-MAIN', 'LAB', 'HB', 'Hemoglobin', 'laboratory', 30.00, 2, true, '{"unit":"g/dL","referenceRange":"Male 13.5-17.5; Female 12.0-15.5"}'::jsonb),
    ('SUNKWA-MAIN', 'LAB', 'LFT', 'Liver Function Test', 'laboratory', 140.00, 6, true, '{"referenceRange":"Panel dependent"}'::jsonb),
    ('SUNKWA-MAIN', 'LAB', 'RFT', 'Renal Function Test', 'laboratory', 130.00, 6, true, '{"referenceRange":"Panel dependent"}'::jsonb),
    ('SUNKWA-MAIN', 'LAB', 'LIPID', 'Lipid Profile', 'laboratory', 120.00, 8, true, '{"referenceRange":"Panel dependent"}'::jsonb),
    ('SUNKWA-MAIN', 'LAB', 'HBA1C', 'HbA1c', 'laboratory', 150.00, 8, true, '{"unit":"%","referenceRange":"< 5.7"}'::jsonb),
    ('SUNKWA-MAIN', 'LAB', 'URINALYSIS', 'Urinalysis', 'laboratory', 45.00, 2, true, '{"referenceRange":"Normal microscopy/chemistry"}'::jsonb),
    ('SUNKWA-MAIN', 'SCAN', 'XR-CHEST', 'Chest X-ray', 'radiology', 180.00, 3, true, '{"modality":"X-RAY"}'::jsonb),
    ('SUNKWA-MAIN', 'SCAN', 'US-ABD', 'Abdominal Ultrasound', 'radiology', 260.00, 4, true, '{"modality":"ULTRASOUND"}'::jsonb),
    ('SUNKWA-MAIN', 'SCAN', 'US-PEL', 'Pelvic Ultrasound', 'radiology', 260.00, 4, true, '{"modality":"ULTRASOUND"}'::jsonb),
    ('SUNKWA-MAIN', 'SCAN', 'CT-HEAD', 'CT Head', 'radiology', 750.00, 8, true, '{"modality":"CT"}'::jsonb),
    ('SUNKWA-MAIN', 'SCAN', 'MRI-LUMBAR', 'MRI Lumbar Spine', 'radiology', 1500.00, 24, true, '{"modality":"MRI"}'::jsonb),

    ('EASTERN-LAB', 'LAB', 'FBC', 'Full Blood Count', 'laboratory', 70.00, 4, true, '{"referenceRange":"See differential report"}'::jsonb),
    ('EASTERN-LAB', 'LAB', 'MALARIA-RDT', 'Malaria Rapid Diagnostic Test', 'laboratory', 30.00, 1, true, '{"referenceRange":"Negative"}'::jsonb),
    ('EASTERN-LAB', 'LAB', 'LFT', 'Liver Function Test', 'laboratory', 125.00, 6, true, '{"referenceRange":"Panel dependent"}'::jsonb),
    ('EASTERN-LAB', 'LAB', 'RFT', 'Renal Function Test', 'laboratory', 120.00, 6, true, '{"referenceRange":"Panel dependent"}'::jsonb),
    ('EASTERN-LAB', 'SCAN', 'XR-CHEST', 'Chest X-ray', 'radiology', 0.00, 0, false, '{"disabledReason":"Scan service disabled for this facility"}'::jsonb),

    ('IMG-PARTNER', 'LAB', 'FBC', 'Full Blood Count', 'laboratory', 0.00, 0, false, '{"disabledReason":"Lab service disabled for this facility"}'::jsonb),
    ('IMG-PARTNER', 'SCAN', 'XR-CHEST', 'Chest X-ray', 'radiology', 170.00, 3, true, '{"modality":"X-RAY"}'::jsonb),
    ('IMG-PARTNER', 'SCAN', 'US-ABD', 'Abdominal Ultrasound', 'radiology', 250.00, 4, true, '{"modality":"ULTRASOUND"}'::jsonb),
    ('IMG-PARTNER', 'SCAN', 'CT-HEAD', 'CT Head', 'radiology', 700.00, 8, true, '{"modality":"CT"}'::jsonb)
)
INSERT INTO "FacilityServiceCatalog" (
  "id", "facilityId", "serviceType", "serviceCode", "serviceName", "departmentKey", "price", "turnaroundHours", "isActive", "config"
)
SELECT 'cat_' || lower(replace(f."code", '-', '_')) || '_' || lower(replace(catalog_seed.service_code, '-', '_')),
       f."id", catalog_seed.service_type, catalog_seed.service_code, catalog_seed.service_name,
       catalog_seed.department_key, catalog_seed.price, catalog_seed.turnaround_hours, catalog_seed.is_active, catalog_seed.config
FROM catalog_seed
JOIN "DiagnosticFacility" f ON f."code" = catalog_seed.facility_code
ON CONFLICT ("facilityId", "serviceType", "serviceCode") DO UPDATE SET
  "serviceName" = EXCLUDED."serviceName",
  "departmentKey" = EXCLUDED."departmentKey",
  "price" = EXCLUDED."price",
  "turnaroundHours" = EXCLUDED."turnaroundHours",
  "isActive" = EXCLUDED."isActive",
  "config" = EXCLUDED."config",
  "updatedAt" = CURRENT_TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 5. Routing rules and facility limits
-- -----------------------------------------------------------------------------
WITH route_seed(facility_code, source_role, request_type, target_department, result_recipient, requires_reception_push, is_enabled, config) AS (
  VALUES
    ('SUNKWA-MAIN', 'CLINICIAN', 'LAB', 'laboratory', 'CLINICIAN', false, true, '{}'::jsonb),
    ('SUNKWA-MAIN', 'RECEPTIONIST', 'LAB', 'laboratory', 'CLINICIAN', false, true, '{"walkIn":true}'::jsonb),
    ('SUNKWA-MAIN', 'CLINICIAN', 'SCAN', 'radiology', 'CLINICIAN', false, true, '{}'::jsonb),
    ('SUNKWA-MAIN', 'RECEPTIONIST', 'SCAN', 'radiology', 'CLINICIAN', false, true, '{"walkIn":true}'::jsonb),
    ('EASTERN-LAB', 'CLINICIAN', 'LAB', 'laboratory', 'CLINICIAN', false, true, '{}'::jsonb),
    ('EASTERN-LAB', 'RECEPTIONIST', 'LAB', 'laboratory', 'CLINICIAN', false, true, '{"walkIn":true}'::jsonb),
    ('EASTERN-LAB', 'CLINICIAN', 'SCAN', 'radiology', 'CLINICIAN', false, false, '{"disabledReason":"No scan unit"}'::jsonb),
    ('IMG-PARTNER', 'CLINICIAN', 'LAB', 'laboratory', 'CLINICIAN', false, false, '{"disabledReason":"No lab unit"}'::jsonb),
    ('IMG-PARTNER', 'CLINICIAN', 'SCAN', 'radiology', 'CLINICIAN', false, true, '{}'::jsonb),
    ('IMG-PARTNER', 'RECEPTIONIST', 'SCAN', 'radiology', 'CLINICIAN', false, true, '{"walkIn":true}'::jsonb)
)
INSERT INTO "FacilityRoutingRule" (
  "id", "facilityId", "sourceRole", "requestType", "targetDepartment", "resultRecipient", "requiresReceptionPush", "isEnabled", "config"
)
SELECT 'route_' || lower(replace(f."code", '-', '_')) || '_' || lower(route_seed.source_role) || '_' || lower(route_seed.request_type),
       f."id", route_seed.source_role, route_seed.request_type, route_seed.target_department,
       route_seed.result_recipient, route_seed.requires_reception_push, route_seed.is_enabled, route_seed.config
FROM route_seed
JOIN "DiagnosticFacility" f ON f."code" = route_seed.facility_code
ON CONFLICT ("id") DO UPDATE SET
  "targetDepartment" = EXCLUDED."targetDepartment",
  "resultRecipient" = EXCLUDED."resultRecipient",
  "requiresReceptionPush" = EXCLUDED."requiresReceptionPush",
  "isEnabled" = EXCLUDED."isEnabled",
  "config" = EXCLUDED."config",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH limit_seed(facility_code, limit_key, limit_value) AS (
  VALUES
    ('SUNKWA-MAIN', 'max_users', 150),
    ('SUNKWA-MAIN', 'max_clinicians', 60),
    ('SUNKWA-MAIN', 'daily_order_limit', 500),
    ('SUNKWA-MAIN', 'storage_gb', 500),
    ('EASTERN-LAB', 'max_users', 50),
    ('EASTERN-LAB', 'max_clinicians', 25),
    ('EASTERN-LAB', 'daily_order_limit', 180),
    ('EASTERN-LAB', 'storage_gb', 150),
    ('IMG-PARTNER', 'max_users', 40),
    ('IMG-PARTNER', 'max_clinicians', 20),
    ('IMG-PARTNER', 'daily_order_limit', 120),
    ('IMG-PARTNER', 'storage_gb', 250)
)
INSERT INTO "FacilityLimit" ("id", "facilityId", "limitKey", "limitValue")
SELECT 'lim_' || lower(replace(f."code", '-', '_')) || '_' || limit_seed.limit_key,
       f."id", limit_seed.limit_key, limit_seed.limit_value
FROM limit_seed
JOIN "DiagnosticFacility" f ON f."code" = limit_seed.facility_code
ON CONFLICT ("facilityId", "limitKey") DO UPDATE SET
  "limitValue" = EXCLUDED."limitValue",
  "updatedAt" = CURRENT_TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 6. Optional facility assignment for existing users.
--    This does not create users because live User schemas vary. It assigns existing users by email if present.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('"User"') IS NOT NULL THEN
    UPDATE "User" SET "facilityId" = 'fac_sunkwa_main' WHERE "facilityId" IS NULL;

    INSERT INTO "FacilityUserAssignment" ("id", "facilityId", "userId", "roleKey", "isPrimary", "status")
    SELECT 'assign_sunkwa_' || lower(replace(COALESCE(u."role"::text, 'staff'), ' ', '_')) || '_' || u."id"::text,
           'fac_sunkwa_main', u."id"::text, COALESCE(u."role"::text, 'STAFF'), true, 'ACTIVE'
    FROM "User" u
    WHERE u."facilityId" = 'fac_sunkwa_main'
    ON CONFLICT ("facilityId", "userId", "roleKey") DO NOTHING;
  END IF;

  IF to_regclass('users') IS NOT NULL THEN
    UPDATE users SET facility_id = 'fac_sunkwa_main' WHERE facility_id IS NULL;

    INSERT INTO "FacilityUserAssignment" ("id", "facilityId", "userId", "roleKey", "isPrimary", "status")
    SELECT 'assign_sunkwa_' || lower(replace(COALESCE(u.role::text, 'staff'), ' ', '_')) || '_' || u.id::text,
           'fac_sunkwa_main', u.id::text, COALESCE(u.role::text, 'STAFF'), true, 'ACTIVE'
    FROM users u
    WHERE u.facility_id = 'fac_sunkwa_main'
    ON CONFLICT ("facilityId", "userId", "roleKey") DO NOTHING;
  END IF;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'Skipping optional user facility assignment because the live user table uses different column names.';
END $$;

-- -----------------------------------------------------------------------------
-- 7. Demonstration accepted samples and result records.
--    These use synthetic patient/order IDs so the new lab/scan sections can be tested
--    even before the live clinical order tables are connected.
-- -----------------------------------------------------------------------------
INSERT INTO "LabAcceptedSample" (
  "id", "facilityId", "orderId", "patientId", "clinicianId", "acceptedById", "sampleCode", "priority", "status", "acceptedAt", "notes"
)
VALUES
  ('lab_sample_demo_001', 'fac_sunkwa_main', 'order_demo_lab_001', 'patient_demo_ama', 'clinician_demo_001', 'lab_staff_demo_001', 'LAB-SUN-0001', 'ROUTINE', 'ACCEPTED', CURRENT_TIMESTAMP - INTERVAL '2 hours', 'Demo accepted sample awaiting per-test result entry.'),
  ('lab_sample_demo_002', 'fac_sunkwa_main', 'order_demo_lab_002', 'patient_demo_kwame', 'clinician_demo_001', 'lab_staff_demo_001', 'LAB-SUN-0002', 'URGENT', 'COMPLETED', CURRENT_TIMESTAMP - INTERVAL '1 day', 'Demo completed sample ready for delivery testing.'),
  ('lab_sample_demo_003', 'fac_eastern_lab', 'order_demo_lab_003', 'patient_demo_efua', 'clinician_demo_002', 'lab_staff_demo_002', 'LAB-EAS-0001', 'ROUTINE', 'SENT_TO_CLINICIAN', CURRENT_TIMESTAMP - INTERVAL '2 days', 'Demo sent result for result archive testing.')
ON CONFLICT ("sampleCode") DO UPDATE SET
  "status" = EXCLUDED."status",
  "priority" = EXCLUDED."priority",
  "notes" = EXCLUDED."notes",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "LabAcceptedSampleTest" (
  "id", "facilityId", "acceptedSampleId", "orderItemId", "testId", "testCode", "testName", "referenceRange", "unit", "resultValue", "resultFlag", "resultNotes", "equipmentNotes", "status", "enteredById", "enteredAt", "completedAt"
)
VALUES
  ('lab_test_demo_001_fbc', 'fac_sunkwa_main', 'lab_sample_demo_001', 'order_item_demo_001_fbc', 'cat_sunkwa_main_fbc', 'FBC', 'Full Blood Count', 'See differential report', NULL, NULL, NULL, NULL, NULL, 'PENDING', NULL, NULL, NULL),
  ('lab_test_demo_001_malaria', 'fac_sunkwa_main', 'lab_sample_demo_001', 'order_item_demo_001_malaria', 'cat_sunkwa_main_malaria_rdt', 'MALARIA-RDT', 'Malaria Rapid Diagnostic Test', 'Negative', NULL, NULL, NULL, NULL, NULL, 'PENDING', NULL, NULL, NULL),
  ('lab_test_demo_002_hb', 'fac_sunkwa_main', 'lab_sample_demo_002', 'order_item_demo_002_hb', 'cat_sunkwa_main_hb', 'HB', 'Hemoglobin', 'Male 13.5-17.5; Female 12.0-15.5', 'g/dL', '12.8', 'LOW', 'Mildly reduced for adult male reference range.', 'Analyzer calibrated before run.', 'COMPLETED', 'lab_staff_demo_001', CURRENT_TIMESTAMP - INTERVAL '23 hours', CURRENT_TIMESTAMP - INTERVAL '23 hours'),
  ('lab_test_demo_003_lft', 'fac_eastern_lab', 'lab_sample_demo_003', 'order_item_demo_003_lft', 'cat_eastern_lab_lft', 'LFT', 'Liver Function Test', 'Panel dependent', NULL, 'Within expected limits', 'NORMAL', 'Panel reviewed and released.', 'No analyzer exception.', 'COMPLETED', 'lab_staff_demo_002', CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days')
ON CONFLICT ("id") DO UPDATE SET
  "resultValue" = EXCLUDED."resultValue",
  "resultFlag" = EXCLUDED."resultFlag",
  "resultNotes" = EXCLUDED."resultNotes",
  "equipmentNotes" = EXCLUDED."equipmentNotes",
  "status" = EXCLUDED."status",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "LabAcceptedSample"
SET "completedAt" = CURRENT_TIMESTAMP - INTERVAL '23 hours'
WHERE "id" = 'lab_sample_demo_002';

UPDATE "LabAcceptedSample"
SET "completedAt" = CURRENT_TIMESTAMP - INTERVAL '2 days', "sentToClinicianAt" = CURRENT_TIMESTAMP - INTERVAL '47 hours'
WHERE "id" = 'lab_sample_demo_003';

INSERT INTO "LabTestResultDocument" (
  "id", "facilityId", "acceptedSampleId", "sampleTestId", "orderId", "patientId", "fileName", "originalName", "mimeType", "fileSize", "fileUrl", "uploadedById", "uploadedAt", "storageProvider", "storageKey", "checksumSha256", "documentType", "extension"
)
VALUES
  ('lab_doc_demo_003_lft_pdf', 'fac_eastern_lab', 'lab_sample_demo_003', 'lab_test_demo_003_lft', 'order_demo_lab_003', 'patient_demo_efua', 'LAB-EAS-0001-LFT.pdf', 'Efua_LFT_Result.pdf', 'application/pdf', 124800, '/uploads/demo/LAB-EAS-0001-LFT.pdf', 'lab_staff_demo_002', CURRENT_TIMESTAMP - INTERVAL '47 hours', 'LOCAL', 'demo/LAB-EAS-0001-LFT.pdf', 'demo-checksum-lab-eas-0001-lft', 'LAB_RESULT_ATTACHMENT', 'pdf')
ON CONFLICT ("id") DO UPDATE SET
  "fileUrl" = EXCLUDED."fileUrl",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ScanAcceptedRequest" (
  "id", "facilityId", "orderId", "patientId", "clinicianId", "acceptedById", "scanCode", "modality", "room", "machine", "technicianNotes", "findings", "impression", "priority", "status", "acceptedAt", "completedAt", "sentToClinicianAt"
)
VALUES
  ('scan_req_demo_001', 'fac_sunkwa_main', 'order_demo_scan_001', 'patient_demo_adjoa', 'clinician_demo_001', 'scan_staff_demo_001', 'SCAN-SUN-0001', 'ULTRASOUND', 'Room 2', 'SonoUnit-A', 'Patient prepared and positioned.', NULL, NULL, 'ROUTINE', 'ACCEPTED', CURRENT_TIMESTAMP - INTERVAL '3 hours', NULL, NULL),
  ('scan_req_demo_002', 'fac_imaging_partner', 'order_demo_scan_002', 'patient_demo_yaw', 'clinician_demo_003', 'scan_staff_demo_002', 'SCAN-IMG-0001', 'X-RAY', 'X-Ray Room 1', 'XR-Partner-01', 'Image quality satisfactory.', 'No acute cardiopulmonary abnormality identified on frontal chest radiograph.', 'No acute chest abnormality.', 'URGENT', 'SENT_TO_CLINICIAN', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '23 hours', CURRENT_TIMESTAMP - INTERVAL '22 hours')
ON CONFLICT ("scanCode") DO UPDATE SET
  "status" = EXCLUDED."status",
  "findings" = EXCLUDED."findings",
  "impression" = EXCLUDED."impression",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ScanResultDocument" (
  "id", "facilityId", "scanAcceptedRequestId", "orderId", "patientId", "fileName", "originalName", "mimeType", "fileSize", "fileUrl", "uploadedById", "uploadedAt", "storageProvider", "storageKey", "checksumSha256", "documentType", "extension"
)
VALUES
  ('scan_doc_demo_002_xray', 'fac_imaging_partner', 'scan_req_demo_002', 'order_demo_scan_002', 'patient_demo_yaw', 'SCAN-IMG-0001-XRAY.jpg', 'Yaw_Chest_Xray.jpg', 'image/jpeg', 242880, '/uploads/demo/SCAN-IMG-0001-XRAY.jpg', 'scan_staff_demo_002', CURRENT_TIMESTAMP - INTERVAL '22 hours', 'LOCAL', 'demo/SCAN-IMG-0001-XRAY.jpg', 'demo-checksum-scan-img-0001-xray', 'SCAN_RESULT_ATTACHMENT', 'jpg')
ON CONFLICT ("id") DO UPDATE SET
  "fileUrl" = EXCLUDED."fileUrl",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ResultDeliveryInbox" (
  "id", "facilityId", "resultType", "sourceId", "orderId", "patientId", "clinicianId", "deliveredById", "status", "deliveredAt", "acceptedSampleId", "scanAcceptedRequestId", "source", "priority", "title", "summary", "payload", "sentById", "sentAt"
)
VALUES
  ('inbox_demo_lab_003', 'fac_eastern_lab', 'LAB', 'lab_sample_demo_003', 'order_demo_lab_003', 'patient_demo_efua', 'clinician_demo_002', 'lab_staff_demo_002', 'SENT', CURRENT_TIMESTAMP - INTERVAL '47 hours', 'lab_sample_demo_003', NULL, 'LAB', 'ROUTINE', 'Laboratory result ready', 'Liver Function Test completed and sent to clinician.', '{"sampleCode":"LAB-EAS-0001","completedTests":["LFT"],"documents":["LAB-EAS-0001-LFT.pdf"]}'::jsonb, 'lab_staff_demo_002', CURRENT_TIMESTAMP - INTERVAL '47 hours'),
  ('inbox_demo_scan_002', 'fac_imaging_partner', 'SCAN', 'scan_req_demo_002', 'order_demo_scan_002', 'patient_demo_yaw', 'clinician_demo_003', 'scan_staff_demo_002', 'SENT', CURRENT_TIMESTAMP - INTERVAL '22 hours', NULL, 'scan_req_demo_002', 'SCAN', 'URGENT', 'Scan result ready', 'Chest X-ray completed and sent to clinician.', '{"scanCode":"SCAN-IMG-0001","modality":"X-RAY","documents":["SCAN-IMG-0001-XRAY.jpg"]}'::jsonb, 'scan_staff_demo_002', CURRENT_TIMESTAMP - INTERVAL '22 hours')
ON CONFLICT ("id") DO UPDATE SET
  "status" = EXCLUDED."status",
  "summary" = EXCLUDED."summary",
  "payload" = EXCLUDED."payload",
  "updatedAt" = CURRENT_TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 8. Workflow event demo history if Phase 11 has been applied.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('facility_workflow_events') IS NOT NULL THEN
    INSERT INTO facility_workflow_events (
      id, facility_id, actor_id, actor_role, event_type, event_group, entity_type, entity_id,
      order_id, patient_id, clinician_id, result_id, document_id, scan_id, sample_id,
      severity, title, message, payload, created_at
    )
    VALUES
      ('wfe_demo_facility_seeded', 'fac_sunkwa_main', 'system_seed', 'SYSTEM', 'FACILITY_SEEDED', 'ADMIN', 'FACILITY', 'fac_sunkwa_main', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'INFO', 'Demo facilities seeded', 'Phase 13 demo facility configuration was seeded.', '{"phase":13}'::jsonb, CURRENT_TIMESTAMP),
      ('wfe_demo_lab_sent', 'fac_eastern_lab', 'lab_staff_demo_002', 'LAB_STAFF', 'LAB_RESULT_SENT_TO_CLINICIAN', 'LABORATORY', 'LAB_ACCEPTED_SAMPLE', 'lab_sample_demo_003', 'order_demo_lab_003', 'patient_demo_efua', 'clinician_demo_002', 'inbox_demo_lab_003', 'lab_doc_demo_003_lft_pdf', NULL, 'lab_sample_demo_003', 'INFO', 'Lab result sent', 'Demo LFT result sent directly to clinician.', '{"sampleCode":"LAB-EAS-0001"}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '47 hours'),
      ('wfe_demo_scan_sent', 'fac_imaging_partner', 'scan_staff_demo_002', 'SCAN_STAFF', 'SCAN_RESULT_SENT_TO_CLINICIAN', 'SCAN', 'SCAN_ACCEPTED_REQUEST', 'scan_req_demo_002', 'order_demo_scan_002', 'patient_demo_yaw', 'clinician_demo_003', 'inbox_demo_scan_002', 'scan_doc_demo_002_xray', 'scan_req_demo_002', NULL, 'INFO', 'Scan result sent', 'Demo chest X-ray result sent directly to clinician.', '{"scanCode":"SCAN-IMG-0001"}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '22 hours')
    ON CONFLICT (id) DO UPDATE SET
      message = EXCLUDED.message,
      payload = EXCLUDED.payload;
  END IF;
END $$;
