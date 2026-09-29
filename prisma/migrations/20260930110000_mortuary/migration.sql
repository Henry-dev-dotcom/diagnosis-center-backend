-- Phase 4D: mortuary (slots and the deceased register).
-- CreateEnum
CREATE TYPE "PlaceOfDeath" AS ENUM ('WARD', 'EMERGENCY', 'THEATRE', 'OUTPATIENT', 'BROUGHT_IN_DEAD');

-- CreateEnum
CREATE TYPE "DeceasedStatus" AS ENUM ('IN_STORAGE', 'RELEASED');

-- CreateTable
CREATE TABLE "MortuarySlot" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT current_setting('lhims.facility_id'::text),
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MortuarySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeceasedRecord" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT current_setting('lhims.facility_id'::text),
    "caseCode" TEXT NOT NULL,
    "patientId" TEXT,
    "fullName" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "estimatedAgeYears" INTEGER,
    "dateOfDeath" TIMESTAMP(3) NOT NULL,
    "placeOfDeath" "PlaceOfDeath" NOT NULL,
    "encounterId" TEXT,
    "causeOfDeath" TEXT,
    "causeIcd10" TEXT,
    "certifiedById" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "policeCase" BOOLEAN NOT NULL DEFAULT false,
    "policeReference" TEXT,
    "policeClearanceRef" TEXT,
    "slotId" TEXT,
    "bodyTag" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredById" TEXT,
    "status" "DeceasedStatus" NOT NULL DEFAULT 'IN_STORAGE',
    "releasedAt" TIMESTAMP(3),
    "releasedTo" TEXT,
    "releasedToRelation" TEXT,
    "releasedToIdNumber" TEXT,
    "releasedById" TEXT,
    "storageDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeceasedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MortuarySlot_facilityId_idx" ON "MortuarySlot"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "MortuarySlot_facilityId_code_key" ON "MortuarySlot"("facilityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DeceasedRecord_patientId_key" ON "DeceasedRecord"("patientId");

-- CreateIndex
CREATE INDEX "DeceasedRecord_facilityId_idx" ON "DeceasedRecord"("facilityId");

-- CreateIndex
CREATE INDEX "DeceasedRecord_status_idx" ON "DeceasedRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeceasedRecord_facilityId_caseCode_key" ON "DeceasedRecord"("facilityId", "caseCode");

-- CreateIndex
CREATE UNIQUE INDEX "DeceasedRecord_facilityId_bodyTag_key" ON "DeceasedRecord"("facilityId", "bodyTag");

-- AddForeignKey
ALTER TABLE "MortuarySlot" ADD CONSTRAINT "MortuarySlot_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeceasedRecord" ADD CONSTRAINT "DeceasedRecord_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeceasedRecord" ADD CONSTRAINT "DeceasedRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeceasedRecord" ADD CONSTRAINT "DeceasedRecord_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeceasedRecord" ADD CONSTRAINT "DeceasedRecord_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "MortuarySlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeceasedRecord" ADD CONSTRAINT "DeceasedRecord_certifiedById_fkey" FOREIGN KEY ("certifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeceasedRecord" ADD CONSTRAINT "DeceasedRecord_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeceasedRecord" ADD CONSTRAINT "DeceasedRecord_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One body per slot while in storage.
CREATE UNIQUE INDEX "DeceasedRecord_one_per_slot" ON "DeceasedRecord"("facilityId", "slotId") WHERE "status" = 'IN_STORAGE' AND "slotId" IS NOT NULL;
-- A released body has been handed to someone, and a stored body has a slot.
ALTER TABLE "DeceasedRecord" ADD CONSTRAINT "DeceasedRecord_release_complete" CHECK ("status" <> 'RELEASED' OR ("releasedAt" IS NOT NULL AND "releasedTo" IS NOT NULL AND "releasedToIdNumber" IS NOT NULL));
ALTER TABLE "DeceasedRecord" ADD CONSTRAINT "DeceasedRecord_stored_has_slot" CHECK ("status" <> 'IN_STORAGE' OR "slotId" IS NOT NULL);

-- Existing facilities get the new module switched on, like every other module.
INSERT INTO "FacilityModule" ("id", "facilityId", "moduleKey", "enabled", "updatedAt")
SELECT 'fm_' || md5(f."id" || ':mortuary'), f."id", 'mortuary', true, CURRENT_TIMESTAMP
FROM "Facility" f
ON CONFLICT ("facilityId", "moduleKey") DO NOTHING;

-- Same-facility guards for every tenant foreign key, regenerated (scripts/facility-guards.ts).
-- Arguments come in pairs: (foreign key column, referenced table).
CREATE OR REPLACE FUNCTION lhims_enforce_same_facility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  i integer := 0;
  ref_id text;
  ref_facility text;
  found_rows integer;
BEGIN
  WHILE i < TG_NARGS LOOP
    EXECUTE format('SELECT ($1).%I::text', TG_ARGV[i]) INTO ref_id USING NEW;
    IF ref_id IS NOT NULL THEN
      EXECUTE format('SELECT "facilityId" FROM %I WHERE "id" = $1', TG_ARGV[i + 1]) INTO ref_facility USING ref_id;
      GET DIAGNOSTICS found_rows = ROW_COUNT;
      -- A missing row is left to the foreign key constraint to report.
      IF found_rows > 0 AND ref_facility IS DISTINCT FROM NEW."facilityId" THEN
        RAISE EXCEPTION 'Cross-facility reference rejected: %.% points at a % row in another facility',
          TG_TABLE_NAME, TG_ARGV[i], TG_ARGV[i + 1]
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lhims_same_facility ON "User";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "customRoleId" ON "User"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('customRoleId', 'FacilityRole');

DROP TRIGGER IF EXISTS lhims_same_facility ON "DoctorProfile";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "hospitalId", "userId" ON "DoctorProfile"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('hospitalId', 'Hospital', 'userId', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Patient";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "createdById", "hospitalId", "referringDoctorId", "updatedById" ON "Patient"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('createdById', 'User', 'hospitalId', 'Hospital', 'referringDoctorId', 'DoctorProfile', 'updatedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "PatientContact";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "patientId" ON "PatientContact"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('patientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "PatientInsurance";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "patientId", "schemeId" ON "PatientInsurance"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('patientId', 'Patient', 'schemeId', 'InsuranceScheme');

DROP TRIGGER IF EXISTS lhims_same_facility ON "PatientDuplicateFlag";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "duplicatePatientId", "primaryPatientId" ON "PatientDuplicateFlag"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('duplicatePatientId', 'Patient', 'primaryPatientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Equipment";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "departmentId" ON "Equipment"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('departmentId', 'Department');

DROP TRIGGER IF EXISTS lhims_same_facility ON "CatalogItem";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "departmentId" ON "CatalogItem"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('departmentId', 'Department');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ReferenceParameter";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "catalogItemId" ON "ReferenceParameter"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('catalogItemId', 'CatalogItem');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ReferenceRange";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "parameterId" ON "ReferenceRange"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('parameterId', 'ReferenceParameter');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Order";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "confirmedById", "createdById", "doctorId", "encounterId", "hospitalId", "patientId" ON "Order"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('confirmedById', 'User', 'createdById', 'User', 'doctorId', 'DoctorProfile', 'encounterId', 'Encounter', 'hospitalId', 'Hospital', 'patientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "OrderItem";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "catalogItemId", "orderId" ON "OrderItem"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('catalogItemId', 'CatalogItem', 'orderId', 'Order');

DROP TRIGGER IF EXISTS lhims_same_facility ON "OrderStatusHistory";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "actorId", "orderId" ON "OrderStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('actorId', 'User', 'orderId', 'Order');

DROP TRIGGER IF EXISTS lhims_same_facility ON "OrderCancellation";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "cancelledById", "orderId" ON "OrderCancellation"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('cancelledById', 'User', 'orderId', 'Order');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Appointment";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "doctorId", "hospitalId", "orderId", "patientId" ON "Appointment"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('doctorId', 'DoctorProfile', 'hospitalId', 'Hospital', 'orderId', 'Order', 'patientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "PatientVisit";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "checkedInById", "orderId", "patientId" ON "PatientVisit"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('checkedInById', 'User', 'orderId', 'Order', 'patientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "LabSample";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "acceptedById", "orderItemId", "patientId" ON "LabSample"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('acceptedById', 'User', 'orderItemId', 'OrderItem', 'patientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "LabResult";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "enteredById", "orderItemId", "patientId", "sampleId" ON "LabResult"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('enteredById', 'User', 'orderItemId', 'OrderItem', 'patientId', 'Patient', 'sampleId', 'LabSample');

DROP TRIGGER IF EXISTS lhims_same_facility ON "LabResultParameter";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "labResultId", "referenceParameterId" ON "LabResultParameter"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('labResultId', 'LabResult', 'referenceParameterId', 'ReferenceParameter');

DROP TRIGGER IF EXISTS lhims_same_facility ON "LabResultReview";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "labResultId", "reviewerId" ON "LabResultReview"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('labResultId', 'LabResult', 'reviewerId', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "LabResultAmendment";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "amendedById", "labResultId" ON "LabResultAmendment"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('amendedById', 'User', 'labResultId', 'LabResult');

DROP TRIGGER IF EXISTS lhims_same_facility ON "SampleRejection";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "rejectedById", "sampleId" ON "SampleRejection"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('rejectedById', 'User', 'sampleId', 'LabSample');

DROP TRIGGER IF EXISTS lhims_same_facility ON "QualityControlRun";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "performedById" ON "QualityControlRun"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('performedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "InventoryTransaction";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "inventoryItemId", "performedById" ON "InventoryTransaction"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('inventoryItemId', 'InventoryItem', 'performedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ScanAcceptance";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "acceptedById", "orderItemId" ON "ScanAcceptance"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('acceptedById', 'User', 'orderItemId', 'OrderItem');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ScanBooking";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "createdById", "equipmentId", "orderItemId", "patientId" ON "ScanBooking"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('createdById', 'User', 'equipmentId', 'Equipment', 'orderItemId', 'OrderItem', 'patientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ScanResult";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "acceptanceId", "orderItemId", "reportedById" ON "ScanResult"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('acceptanceId', 'ScanAcceptance', 'orderItemId', 'OrderItem', 'reportedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ScanResultFile";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "scanResultId" ON "ScanResultFile"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('scanResultId', 'ScanResult');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ScanReview";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "reviewerId", "scanResultId" ON "ScanReview"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('reviewerId', 'User', 'scanResultId', 'ScanResult');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ScanRetake";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "acceptanceId", "requestedById" ON "ScanRetake"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('acceptanceId', 'ScanAcceptance', 'requestedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Invoice";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "createdById", "encounterId", "hospitalId", "orderId", "patientId" ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('createdById', 'User', 'encounterId', 'Encounter', 'hospitalId', 'Hospital', 'orderId', 'Order', 'patientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "InvoiceItem";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "catalogItemId", "invoiceId", "orderItemId" ON "InvoiceItem"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('catalogItemId', 'CatalogItem', 'invoiceId', 'Invoice', 'orderItemId', 'OrderItem');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Payment";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "invoiceId", "receivedById", "shiftId" ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('invoiceId', 'Invoice', 'receivedById', 'User', 'shiftId', 'CashierShift');

DROP TRIGGER IF EXISTS lhims_same_facility ON "CashierShift";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "userId" ON "CashierShift"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('userId', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "FloatTransaction";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "paymentId", "shiftId", "userId" ON "FloatTransaction"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('paymentId', 'Payment', 'shiftId', 'CashierShift', 'userId', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Expense";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "createdById" ON "Expense"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('createdById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ExpensePayment";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "expenseId", "paidById" ON "ExpensePayment"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('expenseId', 'Expense', 'paidById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "LedgerEntry";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "expenseId", "expensePaymentId", "floatTransactionId", "paymentId", "userId" ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('expenseId', 'Expense', 'expensePaymentId', 'ExpensePayment', 'floatTransactionId', 'FloatTransaction', 'paymentId', 'Payment', 'userId', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Receipt";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "paymentId" ON "Receipt"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('paymentId', 'Payment');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Report";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "generatedById", "labResultId", "orderId", "scanResultId" ON "Report"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('generatedById', 'User', 'labResultId', 'LabResult', 'orderId', 'Order', 'scanResultId', 'ScanResult');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Notification";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "createdById", "orderId" ON "Notification"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('createdById', 'User', 'orderId', 'Order');

DROP TRIGGER IF EXISTS lhims_same_facility ON "DeliveryLog";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "notificationId", "performedById", "reportId" ON "DeliveryLog"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('notificationId', 'Notification', 'performedById', 'User', 'reportId', 'Report');

DROP TRIGGER IF EXISTS lhims_same_facility ON "SecureResultLink";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "createdById", "patientId", "reportId" ON "SecureResultLink"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('createdById', 'User', 'patientId', 'Patient', 'reportId', 'Report');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Encounter";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "attendingId", "createdById", "patientId", "visitId" ON "Encounter"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('attendingId', 'User', 'createdById', 'User', 'patientId', 'Patient', 'visitId', 'PatientVisit');

DROP TRIGGER IF EXISTS lhims_same_facility ON "VitalSigns";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "encounterId", "patientId", "recordedById" ON "VitalSigns"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('encounterId', 'Encounter', 'patientId', 'Patient', 'recordedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ClinicalNote";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "amendsId", "authorId", "encounterId", "patientId" ON "ClinicalNote"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('amendsId', 'ClinicalNote', 'authorId', 'User', 'encounterId', 'Encounter', 'patientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Diagnosis";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "encounterId", "patientId", "recordedById" ON "Diagnosis"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('encounterId', 'Encounter', 'patientId', 'Patient', 'recordedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "PatientAllergy";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "patientId", "recordedById" ON "PatientAllergy"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('patientId', 'Patient', 'recordedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Prescription";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "encounterId", "patientId", "prescriberId" ON "Prescription"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('encounterId', 'Encounter', 'patientId', 'Patient', 'prescriberId', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "PrescriptionItem";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "drugId", "prescriptionId" ON "PrescriptionItem"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('drugId', 'Drug', 'prescriptionId', 'Prescription');

DROP TRIGGER IF EXISTS lhims_same_facility ON "DrugBatch";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "drugId", "receivedById" ON "DrugBatch"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('drugId', 'Drug', 'receivedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "StockMovement";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "actorId", "batchId", "dispensationItemId", "drugId" ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('actorId', 'User', 'batchId', 'DrugBatch', 'dispensationItemId', 'DispensationItem', 'drugId', 'Drug');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Dispensation";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "dispensedById", "invoiceId", "prescriptionId" ON "Dispensation"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('dispensedById', 'User', 'invoiceId', 'Invoice', 'prescriptionId', 'Prescription');

DROP TRIGGER IF EXISTS lhims_same_facility ON "DispensationItem";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "dispensationId", "drugId", "prescriptionItemId" ON "DispensationItem"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('dispensationId', 'Dispensation', 'drugId', 'Drug', 'prescriptionItemId', 'PrescriptionItem');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Bed";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "wardId" ON "Bed"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('wardId', 'Ward');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Admission";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "admittedById", "attendingId", "bedId", "dischargedById", "encounterId", "patientId", "sourceEncounterId", "wardId" ON "Admission"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('admittedById', 'User', 'attendingId', 'User', 'bedId', 'Bed', 'dischargedById', 'User', 'encounterId', 'Encounter', 'patientId', 'Patient', 'sourceEncounterId', 'Encounter', 'wardId', 'Ward');

DROP TRIGGER IF EXISTS lhims_same_facility ON "BedAssignment";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "admissionId", "assignedById", "bedId", "wardId" ON "BedAssignment"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('admissionId', 'Admission', 'assignedById', 'User', 'bedId', 'Bed', 'wardId', 'Ward');

DROP TRIGGER IF EXISTS lhims_same_facility ON "MedicationAdministration";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "administeredById", "admissionId", "prescriptionItemId" ON "MedicationAdministration"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('administeredById', 'User', 'admissionId', 'Admission', 'prescriptionItemId', 'PrescriptionItem');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Surgery";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "bookedById", "encounterId", "patientId", "procedureItemId", "surgeonId", "theatreId" ON "Surgery"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('bookedById', 'User', 'encounterId', 'Encounter', 'patientId', 'Patient', 'procedureItemId', 'CatalogItem', 'surgeonId', 'User', 'theatreId', 'Theatre');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ClinicalForm";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "amendsId", "authorId", "encounterId", "patientId", "pregnancyId" ON "ClinicalForm"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('amendsId', 'ClinicalForm', 'authorId', 'User', 'encounterId', 'Encounter', 'patientId', 'Patient', 'pregnancyId', 'Pregnancy');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Pregnancy";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "bookedById", "patientId" ON "Pregnancy"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('bookedById', 'User', 'patientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Delivery";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "attendantId", "encounterId", "pregnancyId" ON "Delivery"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('attendantId', 'User', 'encounterId', 'Encounter', 'pregnancyId', 'Pregnancy');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Newborn";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "deliveryId", "patientId" ON "Newborn"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('deliveryId', 'Delivery', 'patientId', 'Patient');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Immunization";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "encounterId", "givenById", "patientId", "voidedById" ON "Immunization"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('encounterId', 'Encounter', 'givenById', 'User', 'patientId', 'Patient', 'voidedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ClaimBatch";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "schemeId" ON "ClaimBatch"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('schemeId', 'InsuranceScheme');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Claim";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "batchId", "createdById", "encounterId", "patientId", "schemeId" ON "Claim"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('batchId', 'ClaimBatch', 'createdById', 'User', 'encounterId', 'Encounter', 'patientId', 'Patient', 'schemeId', 'InsuranceScheme');

DROP TRIGGER IF EXISTS lhims_same_facility ON "ClaimLine";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "claimId", "invoiceId", "invoiceItemId" ON "ClaimLine"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('claimId', 'Claim', 'invoiceId', 'Invoice', 'invoiceItemId', 'InvoiceItem');

DROP TRIGGER IF EXISTS lhims_same_facility ON "PurchaseOrder";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "approvedById", "raisedById", "supplierId" ON "PurchaseOrder"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('approvedById', 'User', 'raisedById', 'User', 'supplierId', 'Supplier');

DROP TRIGGER IF EXISTS lhims_same_facility ON "PurchaseOrderLine";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "purchaseOrderId", "storeItemId" ON "PurchaseOrderLine"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('purchaseOrderId', 'PurchaseOrder', 'storeItemId', 'StoreItem');

DROP TRIGGER IF EXISTS lhims_same_facility ON "GoodsReceipt";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "purchaseOrderId", "receivedById" ON "GoodsReceipt"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('purchaseOrderId', 'PurchaseOrder', 'receivedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "GoodsReceiptLine";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "goodsReceiptId", "poLineId", "storeItemId" ON "GoodsReceiptLine"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('goodsReceiptId', 'GoodsReceipt', 'poLineId', 'PurchaseOrderLine', 'storeItemId', 'StoreItem');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Requisition";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "issuedById", "requestedById" ON "Requisition"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('issuedById', 'User', 'requestedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "RequisitionLine";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "requisitionId", "storeItemId" ON "RequisitionLine"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('requisitionId', 'Requisition', 'storeItemId', 'StoreItem');

DROP TRIGGER IF EXISTS lhims_same_facility ON "StoreMovement";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "actorId", "storeItemId" ON "StoreMovement"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('actorId', 'User', 'storeItemId', 'StoreItem');

DROP TRIGGER IF EXISTS lhims_same_facility ON "BloodDonation";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "donorId", "takenById" ON "BloodDonation"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('donorId', 'BloodDonor', 'takenById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "BloodUnit";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "donationId", "reservedForRequestId" ON "BloodUnit"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('donationId', 'BloodDonation', 'reservedForRequestId', 'BloodRequest');

DROP TRIGGER IF EXISTS lhims_same_facility ON "BloodRequest";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "encounterId", "patientId", "requestedById" ON "BloodRequest"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('encounterId', 'Encounter', 'patientId', 'Patient', 'requestedById', 'User');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Crossmatch";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "performedById", "requestId", "unitId" ON "Crossmatch"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('performedById', 'User', 'requestId', 'BloodRequest', 'unitId', 'BloodUnit');

DROP TRIGGER IF EXISTS lhims_same_facility ON "Transfusion";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "givenById", "issuedById", "requestId", "unitId" ON "Transfusion"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('givenById', 'User', 'issuedById', 'User', 'requestId', 'BloodRequest', 'unitId', 'BloodUnit');

DROP TRIGGER IF EXISTS lhims_same_facility ON "DeceasedRecord";
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "certifiedById", "encounterId", "patientId", "registeredById", "releasedById", "slotId" ON "DeceasedRecord"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('certifiedById', 'User', 'encounterId', 'Encounter', 'patientId', 'Patient', 'registeredById', 'User', 'releasedById', 'User', 'slotId', 'MortuarySlot');
