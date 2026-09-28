-- Phase 9: Scan/imaging workflow refinement
-- Safe additive migration for installations that already applied Phase 2.

ALTER TABLE IF EXISTS "ScanAcceptedRequest"
  ADD COLUMN IF NOT EXISTS "requestedScans" JSONB,
  ADD COLUMN IF NOT EXISTS "resultStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "conclusion" TEXT,
  ADD COLUMN IF NOT EXISTS "recommendation" TEXT,
  ADD COLUMN IF NOT EXISTS "radiologistNotes" TEXT;

ALTER TABLE IF EXISTS "ScanResultDocument"
  ADD COLUMN IF NOT EXISTS "checksum" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE INDEX IF NOT EXISTS "ScanAcceptedRequest_facility_resultStatus_idx"
  ON "ScanAcceptedRequest"("facilityId", "resultStatus");

CREATE INDEX IF NOT EXISTS "ScanAcceptedRequest_order_idx"
  ON "ScanAcceptedRequest"("orderId");

CREATE INDEX IF NOT EXISTS "ScanAcceptedRequest_patient_idx"
  ON "ScanAcceptedRequest"("patientId");

CREATE INDEX IF NOT EXISTS "ScanAcceptedRequest_clinician_idx"
  ON "ScanAcceptedRequest"("clinicianId");

CREATE INDEX IF NOT EXISTS "ScanResultDocument_facility_scan_idx"
  ON "ScanResultDocument"("facilityId", "scanAcceptedRequestId");
