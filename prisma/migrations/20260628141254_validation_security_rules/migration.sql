-- Phase 12: validation and security support.
-- This migration is intentionally additive and defensive.
-- It adds indexes and optional security metadata columns when matching tables exist.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lab_accepted_samples') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lab_accepted_samples' AND column_name = 'locked_at') THEN
      ALTER TABLE "lab_accepted_samples" ADD COLUMN "locked_at" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lab_accepted_samples' AND column_name = 'locked_reason') THEN
      ALTER TABLE "lab_accepted_samples" ADD COLUMN "locked_reason" TEXT;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scan_accepted_requests') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_accepted_requests' AND column_name = 'locked_at') THEN
      ALTER TABLE "scan_accepted_requests" ADD COLUMN "locked_at" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_accepted_requests' AND column_name = 'locked_reason') THEN
      ALTER TABLE "scan_accepted_requests" ADD COLUMN "locked_reason" TEXT;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lab_test_result_documents') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lab_test_result_documents' AND column_name = 'security_checksum') THEN
      ALTER TABLE "lab_test_result_documents" ADD COLUMN "security_checksum" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lab_test_result_documents' AND column_name = 'validated_at') THEN
      ALTER TABLE "lab_test_result_documents" ADD COLUMN "validated_at" TIMESTAMP(3);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scan_result_documents') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_result_documents' AND column_name = 'security_checksum') THEN
      ALTER TABLE "scan_result_documents" ADD COLUMN "security_checksum" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_result_documents' AND column_name = 'validated_at') THEN
      ALTER TABLE "scan_result_documents" ADD COLUMN "validated_at" TIMESTAMP(3);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_lab_accepted_samples_facility_status" ON "lab_accepted_samples"("facility_id", "status");
CREATE INDEX IF NOT EXISTS "idx_scan_accepted_requests_facility_status" ON "scan_accepted_requests"("facility_id", "status");
CREATE INDEX IF NOT EXISTS "idx_lab_sample_tests_sample_status" ON "lab_accepted_sample_tests"("accepted_sample_id", "status");
CREATE INDEX IF NOT EXISTS "idx_result_delivery_inbox_clinician_status" ON "result_delivery_inbox"("clinician_id", "status");
CREATE INDEX IF NOT EXISTS "idx_facility_workflow_events_facility_type" ON "facility_workflow_events"("facility_id", "event_type");
