-- CreateEnum
CREATE TYPE "FacilityKind" AS ENUM ('DIAGNOSTIC_CENTRE', 'PHARMACY', 'CLINIC', 'HOSPITAL');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "facilityKind" "FacilityKind" NOT NULL DEFAULT 'HOSPITAL';

