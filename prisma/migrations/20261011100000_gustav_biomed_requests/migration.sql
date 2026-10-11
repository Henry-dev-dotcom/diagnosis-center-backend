-- Internal, facility-scoped requests for supply and routine analyzer service follow-up.
CREATE TYPE "GustavBiomedRequestType" AS ENUM ('SUPPLY', 'ANALYZER_MAINTENANCE');
CREATE TYPE "GustavSupplyCategory" AS ENUM ('MEDICAL_EQUIPMENT', 'LABORATORY_EQUIPMENT', 'REAGENTS');
CREATE TYPE "GustavRequestStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'SCHEDULED', 'COMPLETED', 'DECLINED', 'CANCELLED');

CREATE TABLE "GustavBiomedRequest" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT current_setting('lhims.facility_id'::text),
    "requestCode" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL DEFAULT 'Gustav Biomed Limited',
    "type" "GustavBiomedRequestType" NOT NULL,
    "status" "GustavRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestingUnit" TEXT NOT NULL,
    "supplyCategory" "GustavSupplyCategory",
    "itemDescription" TEXT,
    "quantity" INTEGER,
    "quantityUnit" TEXT,
    "analyzerDeviceId" TEXT,
    "analyzerName" TEXT,
    "serviceDescription" TEXT,
    "preferredServiceDate" TIMESTAMP(3),
    "notes" TEXT,
    "statusNote" TEXT,
    "requestedById" TEXT,
    "statusUpdatedById" TEXT,
    "statusUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GustavBiomedRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GustavBiomedRequest_request_shape_check" CHECK (
      length(trim("requestingUnit")) >= 2 AND (
        ("type" = 'SUPPLY'
          AND "supplyCategory" IS NOT NULL
          AND "itemDescription" IS NOT NULL AND length(trim("itemDescription")) >= 2
          AND "quantity" IS NOT NULL AND "quantity" > 0
          AND "quantityUnit" IS NOT NULL AND length(trim("quantityUnit")) > 0
          AND "analyzerDeviceId" IS NULL AND "analyzerName" IS NULL
          AND "serviceDescription" IS NULL AND "preferredServiceDate" IS NULL)
        OR
        ("type" = 'ANALYZER_MAINTENANCE'
          AND "supplyCategory" IS NULL AND "itemDescription" IS NULL
          AND "quantity" IS NULL AND "quantityUnit" IS NULL
          AND "analyzerName" IS NOT NULL AND length(trim("analyzerName")) >= 2
          AND "serviceDescription" IS NOT NULL AND length(trim("serviceDescription")) >= 3)
      )
    )
);

CREATE INDEX "GustavBiomedRequest_facilityId_type_status_createdAt_idx" ON "GustavBiomedRequest"("facilityId", "type", "status", "createdAt");
CREATE INDEX "GustavBiomedRequest_facilityId_requestedById_idx" ON "GustavBiomedRequest"("facilityId", "requestedById");
CREATE INDEX "GustavBiomedRequest_facilityId_analyzerDeviceId_idx" ON "GustavBiomedRequest"("facilityId", "analyzerDeviceId");
CREATE UNIQUE INDEX "GustavBiomedRequest_facilityId_requestCode_key" ON "GustavBiomedRequest"("facilityId", "requestCode");

ALTER TABLE "GustavBiomedRequest" ADD CONSTRAINT "GustavBiomedRequest_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GustavBiomedRequest" ADD CONSTRAINT "GustavBiomedRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GustavBiomedRequest" ADD CONSTRAINT "GustavBiomedRequest_statusUpdatedById_fkey" FOREIGN KEY ("statusUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GustavBiomedRequest" ADD CONSTRAINT "GustavBiomedRequest_analyzerDeviceId_fkey" FOREIGN KEY ("analyzerDeviceId") REFERENCES "AnalyzerDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Protect the request's user and analyzer references against cross-facility IDs.
CREATE TRIGGER "GustavBiomedRequest_same_facility"
  BEFORE INSERT OR UPDATE OF "facilityId", "requestedById", "statusUpdatedById", "analyzerDeviceId"
  ON "GustavBiomedRequest"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility(
    'requestedById', 'User', 'statusUpdatedById', 'User', 'analyzerDeviceId', 'AnalyzerDevice'
  );
