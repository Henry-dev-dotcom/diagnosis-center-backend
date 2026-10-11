ALTER TABLE "VendorPortalAudit"
  ADD COLUMN "targetFullName" TEXT,
  ADD COLUMN "targetEmail" TEXT;

-- Normalize the earlier hand-written trigger name so the schema-wide guard audit recognizes it.
DROP TRIGGER IF EXISTS "GustavBiomedRequest_same_facility" ON "GustavBiomedRequest";
DROP TRIGGER IF EXISTS lhims_same_facility ON "GustavBiomedRequest";
CREATE TRIGGER lhims_same_facility
  BEFORE INSERT OR UPDATE OF "facilityId", "analyzerDeviceId", "requestedById", "statusUpdatedById"
  ON "GustavBiomedRequest"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility(
    'analyzerDeviceId', 'AnalyzerDevice',
    'requestedById', 'User',
    'statusUpdatedById', 'User'
  );
