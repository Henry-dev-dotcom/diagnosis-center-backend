-- AlterTable
ALTER TABLE "User" ADD COLUMN     "customRoleId" TEXT;

-- CreateTable
CREATE TABLE "FacilityModule" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT current_setting('lhims.facility_id'::text),
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityRole" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT current_setting('lhims.facility_id'::text),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseRole" "UserRole" NOT NULL,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacilityModule_facilityId_idx" ON "FacilityModule"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityModule_facilityId_moduleKey_key" ON "FacilityModule"("facilityId", "moduleKey");

-- CreateIndex
CREATE INDEX "FacilityRole_facilityId_idx" ON "FacilityRole"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityRole_facilityId_name_key" ON "FacilityRole"("facilityId", "name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "FacilityRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityModule" ADD CONSTRAINT "FacilityModule_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityRole" ADD CONSTRAINT "FacilityRole_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing facilities keep every module they had: switch all of them on.
INSERT INTO "FacilityModule" ("id", "facilityId", "moduleKey", "enabled", "updatedAt")
SELECT 'fm_' || md5(f."id" || ':' || k.key), f."id", k.key, true, CURRENT_TIMESTAMP
FROM "Facility" f CROSS JOIN (VALUES ('reception'), ('laboratory'), ('imaging'), ('billing'), ('finance'), ('clinician_portal'), ('results_delivery'), ('reports')) AS k(key)
ON CONFLICT ("facilityId", "moduleKey") DO NOTHING;

-- Same-facility guards, regenerated for User.customRoleId (scripts/facility-guards.ts).
DROP TRIGGER IF EXISTS lhims_same_facility ON "User";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "customRoleId" ON "User"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('customRoleId', 'FacilityRole');
