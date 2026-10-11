-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EncounterDraft" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT current_setting('lhims.facility_id'::text),
    "encounterId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncounterDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EncounterDraft_facilityId_idx" ON "EncounterDraft"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "EncounterDraft_encounterId_authorId_key" ON "EncounterDraft"("encounterId", "authorId");

-- AddForeignKey
ALTER TABLE "EncounterDraft" ADD CONSTRAINT "EncounterDraft_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterDraft" ADD CONSTRAINT "EncounterDraft_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterDraft" ADD CONSTRAINT "EncounterDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same-facility guard for the new tenant table (scripts/facility-guards.ts).
DROP TRIGGER IF EXISTS lhims_same_facility ON "EncounterDraft";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "authorId", "encounterId" ON "EncounterDraft"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('authorId', 'User', 'encounterId', 'Encounter');
