-- Cross-facility Gustav Biomed portal identity, request ownership, and audit trail.
CREATE TABLE "VendorPartner" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactPhone" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorPartner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VendorPartner_code_key" ON "VendorPartner"("code");
CREATE INDEX "VendorPartner_isActive_idx" ON "VendorPartner"("isActive");

-- Stable seed identity: requests and vendor accounts bind to this row, never a client-supplied name.
INSERT INTO "VendorPartner" ("id", "code", "name", "contactPhone", "isActive", "createdAt", "updatedAt")
VALUES ('gustav-biomed-limited', 'GUSTAV_BIOMED', 'Gustav Biomed Limited', '+233 59 536 5391', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE "VendorPortalUser" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorPortalUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VendorPortalUser_partnerId_email_key" ON "VendorPortalUser"("partnerId", "email");
CREATE INDEX "VendorPortalUser_partnerId_status_idx" ON "VendorPortalUser"("partnerId", "status");
ALTER TABLE "VendorPortalUser" ADD CONSTRAINT "VendorPortalUser_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "VendorPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VendorPortalSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "previousRefreshTokenHash" TEXT,
  "previousRefreshTokenValidUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "VendorPortalSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VendorPortalSession_refreshTokenHash_key" ON "VendorPortalSession"("refreshTokenHash");
CREATE INDEX "VendorPortalSession_userId_expiresAt_idx" ON "VendorPortalSession"("userId", "expiresAt");
ALTER TABLE "VendorPortalSession" ADD CONSTRAINT "VendorPortalSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "VendorPortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VendorPortalInvite" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "redeemedAt" TIMESTAMP(3),
  CONSTRAINT "VendorPortalInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VendorPortalInvite_tokenHash_key" ON "VendorPortalInvite"("tokenHash");
CREATE INDEX "VendorPortalInvite_partnerId_email_expiresAt_idx" ON "VendorPortalInvite"("partnerId", "email", "expiresAt");
ALTER TABLE "VendorPortalInvite" ADD CONSTRAINT "VendorPortalInvite_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "VendorPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VendorPortalAudit" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "vendorUserId" TEXT,
  "actorPlatformUserId" TEXT,
  "requestId" TEXT,
  "action" TEXT NOT NULL,
  "previousStatus" "GustavRequestStatus",
  "newStatus" "GustavRequestStatus",
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorPortalAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VendorPortalAudit_partnerId_createdAt_idx" ON "VendorPortalAudit"("partnerId", "createdAt");
CREATE INDEX "VendorPortalAudit_requestId_createdAt_idx" ON "VendorPortalAudit"("requestId", "createdAt");
CREATE INDEX "VendorPortalAudit_vendorUserId_createdAt_idx" ON "VendorPortalAudit"("vendorUserId", "createdAt");
CREATE INDEX "VendorPortalAudit_actorPlatformUserId_createdAt_idx" ON "VendorPortalAudit"("actorPlatformUserId", "createdAt");
ALTER TABLE "VendorPortalAudit" ADD CONSTRAINT "VendorPortalAudit_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "VendorPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorPortalAudit" ADD CONSTRAINT "VendorPortalAudit_vendorUserId_fkey"
  FOREIGN KEY ("vendorUserId") REFERENCES "VendorPortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GustavBiomedRequest"
  ADD COLUMN "supplierPartnerId" TEXT,
  ADD COLUMN "statusUpdatedByVendorUserId" TEXT,
  ADD COLUMN "vendorStatusNote" TEXT;

-- The existing request workflow is Gustav-specific; assign its current requests to the seeded partner.
UPDATE "GustavBiomedRequest"
SET "supplierPartnerId" = 'gustav-biomed-limited'
WHERE "supplierPartnerId" IS NULL;

ALTER TABLE "GustavBiomedRequest" ALTER COLUMN "supplierPartnerId" SET NOT NULL;
CREATE INDEX "GustavBiomedRequest_supplierPartnerId_status_createdAt_idx"
  ON "GustavBiomedRequest"("supplierPartnerId", "status", "createdAt");
ALTER TABLE "GustavBiomedRequest" ADD CONSTRAINT "GustavBiomedRequest_supplierPartnerId_fkey"
  FOREIGN KEY ("supplierPartnerId") REFERENCES "VendorPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GustavBiomedRequest" ADD CONSTRAINT "GustavBiomedRequest_statusUpdatedByVendorUserId_fkey"
  FOREIGN KEY ("statusUpdatedByVendorUserId") REFERENCES "VendorPortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendorPortalAudit" ADD CONSTRAINT "VendorPortalAudit_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "GustavBiomedRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
