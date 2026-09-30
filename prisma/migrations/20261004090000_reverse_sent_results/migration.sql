-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- CreateTable
CREATE TABLE "ScanResultAmendment" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT current_setting('lhims.facility_id'::text),
    "scanResultId" TEXT NOT NULL,
    "amendedById" TEXT,
    "reason" TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanResultAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanResultAmendment_facilityId_idx" ON "ScanResultAmendment"("facilityId");

-- CreateIndex
CREATE INDEX "ScanResultAmendment_scanResultId_idx" ON "ScanResultAmendment"("scanResultId");

-- CreateIndex
CREATE INDEX "ScanResultAmendment_createdAt_idx" ON "ScanResultAmendment"("createdAt");

-- AddForeignKey
ALTER TABLE "ScanResultAmendment" ADD CONSTRAINT "ScanResultAmendment_scanResultId_fkey" FOREIGN KEY ("scanResultId") REFERENCES "ScanResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanResultAmendment" ADD CONSTRAINT "ScanResultAmendment_amendedById_fkey" FOREIGN KEY ("amendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanResultAmendment" ADD CONSTRAINT "ScanResultAmendment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Facility guards (regenerate with `npx tsx scripts/facility-guards.ts`).
DROP TRIGGER IF EXISTS lhims_same_facility ON "ScanResultAmendment";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "amendedById", "scanResultId" ON "ScanResultAmendment"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('amendedById', 'User', 'scanResultId', 'ScanResult');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Report";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "generatedById", "labResultId", "orderId", "scanResultId", "voidedById" ON "Report"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('generatedById', 'User', 'labResultId', 'LabResult', 'orderId', 'Order', 'scanResultId', 'ScanResult', 'voidedById', 'User');
