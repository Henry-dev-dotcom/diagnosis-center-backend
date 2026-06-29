-- Phase 2 backend schema upgrade
-- Purpose: multi-facility support + laboratory accepted samples + per-test results + result documents + direct clinician delivery.
-- Target database: PostgreSQL, Prisma-managed backend.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Multi-facility core
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "DiagnosticFacility" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "type" TEXT NOT NULL DEFAULT 'DIAGNOSTIC_CENTER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "city" TEXT,
  "region" TEXT,
  "country" TEXT NOT NULL DEFAULT 'Ghana',
  "logoName" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#2f2925',
  "secondaryColor" TEXT NOT NULL DEFAULT '#efe5d5',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "FacilityFeature" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityFeature_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FacilityFeature_facilityId_featureKey_key" UNIQUE ("facilityId", "featureKey")
);

CREATE TABLE IF NOT EXISTS "FacilityDepartment" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "departmentKey" TEXT NOT NULL,
  "departmentName" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityDepartment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FacilityDepartment_facilityId_departmentKey_key" UNIQUE ("facilityId", "departmentKey")
);

CREATE TABLE IF NOT EXISTS "FacilityServiceCatalog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "serviceType" TEXT NOT NULL,
  "serviceCode" TEXT NOT NULL,
  "serviceName" TEXT NOT NULL,
  "departmentKey" TEXT,
  "price" DECIMAL(12,2),
  "turnaroundHours" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityServiceCatalog_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FacilityServiceCatalog_facilityId_service_key" UNIQUE ("facilityId", "serviceType", "serviceCode")
);

CREATE TABLE IF NOT EXISTS "FacilityRoutingRule" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "sourceRole" TEXT NOT NULL,
  "requestType" TEXT NOT NULL,
  "targetDepartment" TEXT NOT NULL,
  "resultRecipient" TEXT NOT NULL DEFAULT 'CLINICIAN',
  "requiresReceptionPush" BOOLEAN NOT NULL DEFAULT false,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityRoutingRule_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "FacilityLimit" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "limitKey" TEXT NOT NULL,
  "limitValue" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityLimit_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FacilityLimit_facilityId_limitKey_key" UNIQUE ("facilityId", "limitKey")
);

CREATE TABLE IF NOT EXISTS "FacilityUserAssignment" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityUserAssignment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FacilityUserAssignment_facility_user_role_key" UNIQUE ("facilityId", "userId", "roleKey")
);

-- -----------------------------------------------------------------------------
-- 2. Laboratory accepted samples and per-test result records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "LabAcceptedSample" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "clinicianId" TEXT,
  "acceptedById" TEXT NOT NULL,
  "sampleCode" TEXT NOT NULL UNIQUE,
  "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
  "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "sentToClinicianAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabAcceptedSample_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "LabAcceptedSampleTest" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "acceptedSampleId" TEXT NOT NULL,
  "orderItemId" TEXT,
  "testId" TEXT,
  "testCode" TEXT,
  "testName" TEXT NOT NULL,
  "referenceRange" TEXT,
  "unit" TEXT,
  "resultValue" TEXT,
  "resultFlag" TEXT,
  "resultNotes" TEXT,
  "equipmentNotes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "enteredById" TEXT,
  "enteredAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabAcceptedSampleTest_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabAcceptedSampleTest_acceptedSampleId_fkey" FOREIGN KEY ("acceptedSampleId") REFERENCES "LabAcceptedSample"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "LabTestResultDocument" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "acceptedSampleId" TEXT NOT NULL,
  "sampleTestId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabTestResultDocument_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabTestResultDocument_acceptedSampleId_fkey" FOREIGN KEY ("acceptedSampleId") REFERENCES "LabAcceptedSample"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LabTestResultDocument_sampleTestId_fkey" FOREIGN KEY ("sampleTestId") REFERENCES "LabAcceptedSampleTest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- -----------------------------------------------------------------------------
-- 3. Direct result delivery to clinician
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ResultDeliveryInbox" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "resultType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "clinicianId" TEXT NOT NULL,
  "deliveredById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResultDeliveryInbox_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- -----------------------------------------------------------------------------
-- 4. Scan/imaging accepted requests and documents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ScanAcceptedRequest" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "clinicianId" TEXT,
  "acceptedById" TEXT NOT NULL,
  "scanCode" TEXT NOT NULL UNIQUE,
  "modality" TEXT,
  "room" TEXT,
  "machine" TEXT,
  "technicianNotes" TEXT,
  "findings" TEXT,
  "impression" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
  "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "sentToClinicianAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScanAcceptedRequest_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ScanResultDocument" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId" TEXT NOT NULL,
  "scanAcceptedRequestId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScanResultDocument_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DiagnosticFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ScanResultDocument_scanAcceptedRequestId_fkey" FOREIGN KEY ("scanAcceptedRequestId") REFERENCES "ScanAcceptedRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- -----------------------------------------------------------------------------
-- 5. Add facility scoping columns to common existing tables, if those tables exist.
--    These ALTER statements are intentionally safe and additive.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "patients" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "LabRequest" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "lab_requests" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "ScanRequest" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "scan_requests" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "Result" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "results" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "Notification" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "notifications" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "AuditLog" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "audit_logs" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "File" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "files" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "Invoice" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "invoices" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "Payment" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;
ALTER TABLE IF EXISTS "payments" ADD COLUMN IF NOT EXISTS "facilityId" TEXT;

-- -----------------------------------------------------------------------------
-- 6. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "DiagnosticFacility_status_idx" ON "DiagnosticFacility"("status");
CREATE INDEX IF NOT EXISTS "FacilityFeature_facilityId_idx" ON "FacilityFeature"("facilityId");
CREATE INDEX IF NOT EXISTS "FacilityDepartment_facilityId_idx" ON "FacilityDepartment"("facilityId");
CREATE INDEX IF NOT EXISTS "FacilityServiceCatalog_facilityId_idx" ON "FacilityServiceCatalog"("facilityId");
CREATE INDEX IF NOT EXISTS "FacilityServiceCatalog_serviceType_idx" ON "FacilityServiceCatalog"("serviceType");
CREATE INDEX IF NOT EXISTS "FacilityUserAssignment_facilityId_idx" ON "FacilityUserAssignment"("facilityId");
CREATE INDEX IF NOT EXISTS "FacilityUserAssignment_userId_idx" ON "FacilityUserAssignment"("userId");
CREATE INDEX IF NOT EXISTS "LabAcceptedSample_facility_status_idx" ON "LabAcceptedSample"("facilityId", "status");
CREATE INDEX IF NOT EXISTS "LabAcceptedSample_patient_idx" ON "LabAcceptedSample"("patientId");
CREATE INDEX IF NOT EXISTS "LabAcceptedSample_order_idx" ON "LabAcceptedSample"("orderId");
CREATE INDEX IF NOT EXISTS "LabAcceptedSampleTest_sample_status_idx" ON "LabAcceptedSampleTest"("acceptedSampleId", "status");
CREATE INDEX IF NOT EXISTS "LabTestResultDocument_test_idx" ON "LabTestResultDocument"("sampleTestId");
CREATE INDEX IF NOT EXISTS "ResultDeliveryInbox_clinician_status_idx" ON "ResultDeliveryInbox"("clinicianId", "status");
CREATE INDEX IF NOT EXISTS "ResultDeliveryInbox_facility_idx" ON "ResultDeliveryInbox"("facilityId");
CREATE INDEX IF NOT EXISTS "ScanAcceptedRequest_facility_status_idx" ON "ScanAcceptedRequest"("facilityId", "status");
CREATE INDEX IF NOT EXISTS "ScanResultDocument_scan_idx" ON "ScanResultDocument"("scanAcceptedRequestId");

-- Conditional indexes for existing tables.
DO $$
BEGIN
  IF to_regclass('"User"') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS "User_facilityId_idx" ON "User"("facilityId"); END IF;
  IF to_regclass('"users"') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS "users_facilityId_idx" ON "users"("facilityId"); END IF;
  IF to_regclass('"Patient"') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS "Patient_facilityId_idx" ON "Patient"("facilityId"); END IF;
  IF to_regclass('"patients"') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS "patients_facilityId_idx" ON "patients"("facilityId"); END IF;
  IF to_regclass('"Order"') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS "Order_facilityId_idx" ON "Order"("facilityId"); END IF;
  IF to_regclass('"orders"') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS "orders_facilityId_idx" ON "orders"("facilityId"); END IF;
  IF to_regclass('"Notification"') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS "Notification_facilityId_idx" ON "Notification"("facilityId"); END IF;
  IF to_regclass('"notifications"') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS "notifications_facilityId_idx" ON "notifications"("facilityId"); END IF;
  IF to_regclass('"AuditLog"') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS "AuditLog_facilityId_idx" ON "AuditLog"("facilityId"); END IF;
  IF to_regclass('"audit_logs"') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS "audit_logs_facilityId_idx" ON "audit_logs"("facilityId"); END IF;
END $$;
