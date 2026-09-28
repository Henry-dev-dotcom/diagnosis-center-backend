-- Phase 6: Result document upload/storage metadata.
-- Safe additive migration for PostgreSQL. Run after Phase 2 schema is applied.

ALTER TABLE "LabTestResultDocument"
  ADD COLUMN IF NOT EXISTS "storageProvider" TEXT DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "checksumSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "documentType" TEXT DEFAULT 'LAB_RESULT_ATTACHMENT',
  ADD COLUMN IF NOT EXISTS "extension" TEXT,
  ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

ALTER TABLE "ScanResultDocument"
  ADD COLUMN IF NOT EXISTS "storageProvider" TEXT DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "checksumSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "documentType" TEXT DEFAULT 'SCAN_RESULT_ATTACHMENT',
  ADD COLUMN IF NOT EXISTS "extension" TEXT,
  ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

CREATE INDEX IF NOT EXISTS "LabTestResultDocument_facilityId_uploadedAt_idx"
  ON "LabTestResultDocument" ("facilityId", "uploadedAt");

CREATE INDEX IF NOT EXISTS "LabTestResultDocument_orderId_patientId_idx"
  ON "LabTestResultDocument" ("orderId", "patientId");

CREATE INDEX IF NOT EXISTS "LabTestResultDocument_isDeleted_idx"
  ON "LabTestResultDocument" ("isDeleted");

CREATE INDEX IF NOT EXISTS "ScanResultDocument_facilityId_uploadedAt_idx"
  ON "ScanResultDocument" ("facilityId", "uploadedAt");

CREATE INDEX IF NOT EXISTS "ScanResultDocument_orderId_patientId_idx"
  ON "ScanResultDocument" ("orderId", "patientId");

CREATE INDEX IF NOT EXISTS "ScanResultDocument_isDeleted_idx"
  ON "ScanResultDocument" ("isDeleted");
