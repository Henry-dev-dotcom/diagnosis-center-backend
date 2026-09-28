-- Phase 7 clinician result delivery refinement.
-- This migration is intentionally defensive because deployments may already have
-- ResultDeliveryInbox from Phase 2 or a differently named legacy result inbox table.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ResultDeliveryInbox') THEN
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "acceptedSampleId" TEXT;
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "scanAcceptedRequestId" TEXT;
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'LAB';
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'ROUTINE';
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "title" TEXT;
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "summary" TEXT;
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "payload" JSONB;
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "sentById" TEXT;
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "readById" TEXT;
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
    ALTER TABLE "ResultDeliveryInbox" ADD COLUMN IF NOT EXISTS "archivedById" TEXT;

    CREATE INDEX IF NOT EXISTS "ResultDeliveryInbox_facility_clinician_sentAt_idx"
      ON "ResultDeliveryInbox"("facilityId", "clinicianId", "sentAt");
    CREATE INDEX IF NOT EXISTS "ResultDeliveryInbox_facility_patient_idx"
      ON "ResultDeliveryInbox"("facilityId", "patientId");
    CREATE INDEX IF NOT EXISTS "ResultDeliveryInbox_facility_order_idx"
      ON "ResultDeliveryInbox"("facilityId", "orderId");
    CREATE INDEX IF NOT EXISTS "ResultDeliveryInbox_source_status_idx"
      ON "ResultDeliveryInbox"("source", "status");
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Result') THEN
    ALTER TABLE "Result" ADD COLUMN IF NOT EXISTS "sentToClinicianAt" TIMESTAMP(3);
    ALTER TABLE "Result" ADD COLUMN IF NOT EXISTS "clinicianId" TEXT;
    ALTER TABLE "Result" ADD COLUMN IF NOT EXISTS "source" TEXT;
    ALTER TABLE "Result" ADD COLUMN IF NOT EXISTS "title" TEXT;
    ALTER TABLE "Result" ADD COLUMN IF NOT EXISTS "summary" TEXT;
    ALTER TABLE "Result" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
  END IF;
END $$;
