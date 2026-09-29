-- CreateEnum
CREATE TYPE "DemoRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- AlterTable
ALTER TABLE "Facility" ADD COLUMN     "allowSupportAccess" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "logoDataUrl" TEXT,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "signupSource" TEXT NOT NULL DEFAULT 'PLATFORM';

-- AlterTable
ALTER TABLE "UserSession" ADD COLUMN     "impersonatorId" TEXT,
ADD COLUMN     "supportReason" TEXT;

-- CreateTable
CREATE TABLE "DemoRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "facilityType" TEXT,
    "message" TEXT,
    "status" "DemoRequestStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoRequest_status_idx" ON "DemoRequest"("status");


-- Facilities that exist before Phase 6 were set up by the platform operator
-- and are already in use: they skip the setup checklist.
UPDATE "Facility" SET "onboardingCompletedAt" = now() WHERE "onboardingCompletedAt" IS NULL;

ALTER TABLE "Facility" ADD CONSTRAINT "Facility_signupSource_check" CHECK ("signupSource" IN ('PLATFORM', 'SELF_SERVICE'));
