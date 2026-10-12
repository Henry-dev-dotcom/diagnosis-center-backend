-- CreateEnum
CREATE TYPE "MedicationBlock" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT');

-- CreateEnum
CREATE TYPE "FluidDirection" AS ENUM ('INTAKE', 'OUTPUT');

-- AlterTable
ALTER TABLE "Admission" ADD COLUMN     "resultsReviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MedicationAdministration" ADD COLUMN     "scheduleBlock" "MedicationBlock",
ADD COLUMN     "scheduleDate" TEXT,
ADD COLUMN     "scheduleSlot" INTEGER;

-- CreateTable
CREATE TABLE "FluidBalanceEntry" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT current_setting('lhims.facility_id'::text),
    "admissionId" TEXT NOT NULL,
    "direction" "FluidDirection" NOT NULL,
    "kind" TEXT NOT NULL,
    "volumeMl" INTEGER NOT NULL,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,

    CONSTRAINT "FluidBalanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FluidBalanceEntry_facilityId_idx" ON "FluidBalanceEntry"("facilityId");

-- CreateIndex
CREATE INDEX "FluidBalanceEntry_admissionId_recordedAt_idx" ON "FluidBalanceEntry"("admissionId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationAdministration_prescriptionItemId_scheduleDate_sc_key" ON "MedicationAdministration"("prescriptionItemId", "scheduleDate", "scheduleBlock", "scheduleSlot");

-- AddForeignKey
ALTER TABLE "FluidBalanceEntry" ADD CONSTRAINT "FluidBalanceEntry_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluidBalanceEntry" ADD CONSTRAINT "FluidBalanceEntry_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluidBalanceEntry" ADD CONSTRAINT "FluidBalanceEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Same-facility guard for the new tenant table (scripts/facility-guards.ts).
DROP TRIGGER IF EXISTS lhims_same_facility ON "FluidBalanceEntry";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "admissionId", "recordedById" ON "FluidBalanceEntry"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('admissionId', 'Admission', 'recordedById', 'User');
