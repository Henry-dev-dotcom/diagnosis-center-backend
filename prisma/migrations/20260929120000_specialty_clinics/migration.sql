-- Phase 4C: specialty clinics (visit clinic, structured clinical forms).
-- CreateEnum
CREATE TYPE "Clinic" AS ENUM ('GENERAL', 'DENTAL', 'EYE', 'PHYSIOTHERAPY', 'DIETETICS');

-- CreateEnum
CREATE TYPE "ClinicalFormType" AS ENUM ('DENTAL_CHART', 'EYE_EXAM', 'PHYSIO_ASSESSMENT', 'PHYSIO_SESSION', 'NUTRITION_ASSESSMENT');

-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN     "clinic" "Clinic" NOT NULL DEFAULT 'GENERAL';

-- CreateTable
CREATE TABLE "ClinicalForm" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT current_setting('lhims.facility_id'::text),
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "ClinicalFormType" NOT NULL,
    "data" JSONB NOT NULL,
    "authorId" TEXT,
    "amendsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalForm_facilityId_idx" ON "ClinicalForm"("facilityId");

-- CreateIndex
CREATE INDEX "ClinicalForm_encounterId_idx" ON "ClinicalForm"("encounterId");

-- CreateIndex
CREATE INDEX "ClinicalForm_patientId_type_createdAt_idx" ON "ClinicalForm"("patientId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Encounter_clinic_idx" ON "Encounter"("clinic");

-- AddForeignKey
ALTER TABLE "ClinicalForm" ADD CONSTRAINT "ClinicalForm_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalForm" ADD CONSTRAINT "ClinicalForm_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalForm" ADD CONSTRAINT "ClinicalForm_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalForm" ADD CONSTRAINT "ClinicalForm_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalForm" ADD CONSTRAINT "ClinicalForm_amendsId_fkey" FOREIGN KEY ("amendsId") REFERENCES "ClinicalForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing facilities get the new modules switched on, like every other module.
INSERT INTO "FacilityModule" ("id", "facilityId", "moduleKey", "enabled", "updatedAt")
SELECT 'fm_' || md5(f."id" || ':' || m.key), f."id", m.key, true, CURRENT_TIMESTAMP
FROM "Facility" f CROSS JOIN (VALUES ('dental'), ('eye'), ('physiotherapy'), ('dietetics')) AS m(key)
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
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "patientId" ON "PatientInsurance"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('patientId', 'Patient');

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
CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF "facilityId", "amendsId", "authorId", "encounterId", "patientId" ON "ClinicalForm"
  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility('amendsId', 'ClinicalForm', 'authorId', 'User', 'encounterId', 'Encounter', 'patientId', 'Patient');
