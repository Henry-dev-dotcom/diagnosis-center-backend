-- Claims officer role and claim vetting.
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CLAIMS_OFFICER';

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN "vettedAt" TIMESTAMP(3),
ADD COLUMN "vettedById" TEXT,
ADD COLUMN "vetNote" TEXT;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_vettedById_fkey" FOREIGN KEY ("vettedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same-facility guard, regenerated for Claim now that it references the vetting user.
DROP TRIGGER IF EXISTS lhims_same_facility ON "Claim";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "batchId", "createdById", "encounterId", "patientId", "schemeId", "vettedById" ON "Claim"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('batchId', 'ClaimBatch', 'createdById', 'User', 'encounterId', 'Encounter', 'patientId', 'Patient', 'schemeId', 'InsuranceScheme', 'vettedById', 'User');
