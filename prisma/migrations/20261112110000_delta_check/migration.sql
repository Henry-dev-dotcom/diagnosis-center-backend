-- Cross-facility delta check: opt-in flag, request table, notification type.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DELTA_CHECK';

-- CreateEnum
CREATE TYPE "DeltaCheckStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'NO_MATCH', 'CANCELLED');

-- AlterTable
ALTER TABLE "Facility" ADD COLUMN "deltaCheckOptIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DeltaCheckRequest" (
    "id" TEXT NOT NULL,
    "requesterFacilityId" TEXT NOT NULL,
    "ownerFacilityId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "patientLocalId" TEXT NOT NULL,
    "patientSummary" TEXT NOT NULL,
    "matchNationalId" TEXT NOT NULL,
    "patientDob" TIMESTAMP(3),
    "parameters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lookbackDays" INTEGER NOT NULL DEFAULT 365,
    "reason" TEXT NOT NULL,
    "status" "DeltaCheckStatus" NOT NULL DEFAULT 'PENDING',
    "responderName" TEXT,
    "responseNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "sharedData" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeltaCheckRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeltaCheckRequest_requesterFacilityId_createdAt_idx" ON "DeltaCheckRequest"("requesterFacilityId", "createdAt");

-- CreateIndex
CREATE INDEX "DeltaCheckRequest_ownerFacilityId_status_createdAt_idx" ON "DeltaCheckRequest"("ownerFacilityId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "DeltaCheckRequest" ADD CONSTRAINT "DeltaCheckRequest_requesterFacilityId_fkey" FOREIGN KEY ("requesterFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeltaCheckRequest" ADD CONSTRAINT "DeltaCheckRequest_ownerFacilityId_fkey" FOREIGN KEY ("ownerFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
