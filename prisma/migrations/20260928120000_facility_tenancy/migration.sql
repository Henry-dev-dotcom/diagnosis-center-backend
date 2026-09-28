-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PLATFORM_ADMIN';

-- DropIndex
DROP INDEX "Appointment_appointmentCode_key";

-- DropIndex
DROP INDEX "CashierShift_shiftCode_key";

-- DropIndex
DROP INDEX "CatalogItem_catalogCode_key";

-- DropIndex
DROP INDEX "Department_code_key";

-- DropIndex
DROP INDEX "DoctorProfile_licenseNumber_key";

-- DropIndex
DROP INDEX "Equipment_serialNumber_key";

-- DropIndex
DROP INDEX "Expense_expenseCode_key";

-- DropIndex
DROP INDEX "Hospital_code_key";

-- DropIndex
DROP INDEX "InventoryItem_itemCode_key";

-- DropIndex
DROP INDEX "Invoice_invoiceCode_key";

-- DropIndex
DROP INDEX "LabResult_resultCode_key";

-- DropIndex
DROP INDEX "LabSample_sampleCode_key";

-- DropIndex
DROP INDEX "LedgerEntry_entryCode_key";

-- DropIndex
DROP INDEX "Order_orderCode_key";

-- DropIndex
DROP INDEX "Patient_patientCode_key";

-- DropIndex
DROP INDEX "PatientVisit_visitCode_key";

-- DropIndex
DROP INDEX "Payment_paymentCode_key";

-- DropIndex
DROP INDEX "Receipt_receiptCode_key";

-- DropIndex
DROP INDEX "Report_reportCode_key";

-- DropIndex
DROP INDEX "ScanBooking_bookingCode_key";

-- DropIndex
DROP INDEX "ScanResult_resultCode_key";

-- DropIndex
DROP INDEX "User_email_key";

-- DropIndex
DROP INDEX "User_username_key";

-- AlterTable
ALTER TABLE "ApiRequestLog" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "CashierShift" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "DeliveryLog" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "DoctorProfile" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "ExpensePayment" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "FloatTransaction" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "InventoryTransaction" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "LabResult" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "LabResultAmendment" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "LabResultParameter" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "LabResultReview" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "LabSample" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "OrderCancellation" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "OrderStatusHistory" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "PatientContact" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "PatientDuplicateFlag" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "PatientInsurance" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "PatientVisit" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "QualityControlRun" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "ReferenceParameter" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "ReferenceRange" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "SampleRejection" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "ScanAcceptance" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "ScanBooking" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "ScanResult" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "ScanResultFile" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "ScanRetake" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "ScanReview" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "SecureResultLink" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "SystemEvent" ADD COLUMN     "facilityId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "facilityId" TEXT;

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "FacilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- Backfill: every existing row belongs to one default facility.
INSERT INTO "Facility" ("id","code","name","updatedAt")
VALUES ('fac_default','DEFAULT','Default Facility',CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
UPDATE "ApiRequestLog" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Appointment" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "AuditLog" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "CashierShift" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "CatalogItem" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "DeliveryLog" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Department" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "DoctorProfile" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Equipment" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Expense" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "ExpensePayment" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "FloatTransaction" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Hospital" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "InventoryItem" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "InventoryTransaction" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Invoice" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "InvoiceItem" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "LabResult" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "LabResultAmendment" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "LabResultParameter" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "LabResultReview" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "LabSample" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "LedgerEntry" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Notification" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Order" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "OrderCancellation" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "OrderItem" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "OrderStatusHistory" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Patient" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "PatientContact" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "PatientDuplicateFlag" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "PatientInsurance" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "PatientVisit" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Payment" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "QualityControlRun" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Receipt" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "ReferenceParameter" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "ReferenceRange" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "Report" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "SampleRejection" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "ScanAcceptance" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "ScanBooking" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "ScanResult" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "ScanResultFile" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "ScanRetake" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "ScanReview" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "SecureResultLink" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "SystemEvent" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;
UPDATE "User" SET "facilityId" = 'fac_default' WHERE "facilityId" IS NULL;

-- Required tenancy columns become NOT NULL once backfilled.
ALTER TABLE "Appointment" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "CashierShift" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "CatalogItem" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "DeliveryLog" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Department" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "DoctorProfile" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Equipment" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "ExpensePayment" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "FloatTransaction" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Hospital" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "InventoryTransaction" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "InvoiceItem" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "LabResult" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "LabResultAmendment" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "LabResultParameter" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "LabResultReview" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "LabSample" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "LedgerEntry" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "OrderCancellation" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Patient" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "PatientContact" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "PatientDuplicateFlag" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "PatientInsurance" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "PatientVisit" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "QualityControlRun" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Receipt" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "ReferenceParameter" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "ReferenceRange" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "Report" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "SampleRejection" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "ScanAcceptance" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "ScanBooking" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "ScanResult" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "ScanResultFile" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "ScanRetake" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "ScanReview" ALTER COLUMN "facilityId" SET NOT NULL;
ALTER TABLE "SecureResultLink" ALTER COLUMN "facilityId" SET NOT NULL;

-- Unstamped inserts fail loudly: the setting is never defined, so a row that
-- bypasses the tenant extension errors instead of landing without a facility.
ALTER TABLE "Appointment" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "CashierShift" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "CatalogItem" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "DeliveryLog" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Department" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "DoctorProfile" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Equipment" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Expense" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "ExpensePayment" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "FloatTransaction" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Hospital" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "InventoryItem" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "InventoryTransaction" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Invoice" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "InvoiceItem" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "LabResult" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "LabResultAmendment" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "LabResultParameter" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "LabResultReview" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "LabSample" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "LedgerEntry" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Notification" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Order" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "OrderCancellation" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "OrderItem" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Patient" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "PatientContact" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "PatientDuplicateFlag" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "PatientInsurance" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "PatientVisit" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Payment" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "QualityControlRun" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Receipt" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "ReferenceParameter" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "ReferenceRange" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "Report" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "SampleRejection" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "ScanAcceptance" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "ScanBooking" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "ScanResult" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "ScanResultFile" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "ScanRetake" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "ScanReview" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');
ALTER TABLE "SecureResultLink" ALTER COLUMN "facilityId" SET DEFAULT current_setting('lhims.facility_id');

-- Platform users (facilityId IS NULL) still need globally unique logins.
CREATE UNIQUE INDEX "User_platform_username_key" ON "User"("username") WHERE "facilityId" IS NULL;
CREATE UNIQUE INDEX "User_platform_email_key" ON "User"("email") WHERE "facilityId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Facility_code_key" ON "Facility"("code");

-- CreateIndex
CREATE INDEX "Facility_status_idx" ON "Facility"("status");

-- CreateIndex
CREATE INDEX "ApiRequestLog_facilityId_idx" ON "ApiRequestLog"("facilityId");

-- CreateIndex
CREATE INDEX "Appointment_facilityId_idx" ON "Appointment"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_facilityId_appointmentCode_key" ON "Appointment"("facilityId", "appointmentCode");

-- CreateIndex
CREATE INDEX "AuditLog_facilityId_idx" ON "AuditLog"("facilityId");

-- CreateIndex
CREATE INDEX "CashierShift_facilityId_idx" ON "CashierShift"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "CashierShift_facilityId_shiftCode_key" ON "CashierShift"("facilityId", "shiftCode");

-- CreateIndex
CREATE INDEX "CatalogItem_facilityId_idx" ON "CatalogItem"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_facilityId_catalogCode_key" ON "CatalogItem"("facilityId", "catalogCode");

-- CreateIndex
CREATE INDEX "DeliveryLog_facilityId_idx" ON "DeliveryLog"("facilityId");

-- CreateIndex
CREATE INDEX "Department_facilityId_idx" ON "Department"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_facilityId_code_key" ON "Department"("facilityId", "code");

-- CreateIndex
CREATE INDEX "DoctorProfile_facilityId_idx" ON "DoctorProfile"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_facilityId_licenseNumber_key" ON "DoctorProfile"("facilityId", "licenseNumber");

-- CreateIndex
CREATE INDEX "Equipment_facilityId_idx" ON "Equipment"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_facilityId_serialNumber_key" ON "Equipment"("facilityId", "serialNumber");

-- CreateIndex
CREATE INDEX "Expense_facilityId_idx" ON "Expense"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_facilityId_expenseCode_key" ON "Expense"("facilityId", "expenseCode");

-- CreateIndex
CREATE INDEX "ExpensePayment_facilityId_idx" ON "ExpensePayment"("facilityId");

-- CreateIndex
CREATE INDEX "FloatTransaction_facilityId_idx" ON "FloatTransaction"("facilityId");

-- CreateIndex
CREATE INDEX "Hospital_facilityId_idx" ON "Hospital"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_facilityId_code_key" ON "Hospital"("facilityId", "code");

-- CreateIndex
CREATE INDEX "InventoryItem_facilityId_idx" ON "InventoryItem"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_facilityId_itemCode_key" ON "InventoryItem"("facilityId", "itemCode");

-- CreateIndex
CREATE INDEX "InventoryTransaction_facilityId_idx" ON "InventoryTransaction"("facilityId");

-- CreateIndex
CREATE INDEX "Invoice_facilityId_idx" ON "Invoice"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_facilityId_invoiceCode_key" ON "Invoice"("facilityId", "invoiceCode");

-- CreateIndex
CREATE INDEX "InvoiceItem_facilityId_idx" ON "InvoiceItem"("facilityId");

-- CreateIndex
CREATE INDEX "LabResult_facilityId_idx" ON "LabResult"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "LabResult_facilityId_resultCode_key" ON "LabResult"("facilityId", "resultCode");

-- CreateIndex
CREATE INDEX "LabResultAmendment_facilityId_idx" ON "LabResultAmendment"("facilityId");

-- CreateIndex
CREATE INDEX "LabResultParameter_facilityId_idx" ON "LabResultParameter"("facilityId");

-- CreateIndex
CREATE INDEX "LabResultReview_facilityId_idx" ON "LabResultReview"("facilityId");

-- CreateIndex
CREATE INDEX "LabSample_facilityId_idx" ON "LabSample"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "LabSample_facilityId_sampleCode_key" ON "LabSample"("facilityId", "sampleCode");

-- CreateIndex
CREATE INDEX "LedgerEntry_facilityId_idx" ON "LedgerEntry"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_facilityId_entryCode_key" ON "LedgerEntry"("facilityId", "entryCode");

-- CreateIndex
CREATE INDEX "Notification_facilityId_idx" ON "Notification"("facilityId");

-- CreateIndex
CREATE INDEX "Order_facilityId_idx" ON "Order"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_facilityId_orderCode_key" ON "Order"("facilityId", "orderCode");

-- CreateIndex
CREATE INDEX "OrderCancellation_facilityId_idx" ON "OrderCancellation"("facilityId");

-- CreateIndex
CREATE INDEX "OrderItem_facilityId_idx" ON "OrderItem"("facilityId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_facilityId_idx" ON "OrderStatusHistory"("facilityId");

-- CreateIndex
CREATE INDEX "Patient_facilityId_idx" ON "Patient"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_facilityId_patientCode_key" ON "Patient"("facilityId", "patientCode");

-- CreateIndex
CREATE INDEX "PatientContact_facilityId_idx" ON "PatientContact"("facilityId");

-- CreateIndex
CREATE INDEX "PatientDuplicateFlag_facilityId_idx" ON "PatientDuplicateFlag"("facilityId");

-- CreateIndex
CREATE INDEX "PatientInsurance_facilityId_idx" ON "PatientInsurance"("facilityId");

-- CreateIndex
CREATE INDEX "PatientVisit_facilityId_idx" ON "PatientVisit"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientVisit_facilityId_visitCode_key" ON "PatientVisit"("facilityId", "visitCode");

-- CreateIndex
CREATE INDEX "Payment_facilityId_idx" ON "Payment"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_facilityId_paymentCode_key" ON "Payment"("facilityId", "paymentCode");

-- CreateIndex
CREATE INDEX "QualityControlRun_facilityId_idx" ON "QualityControlRun"("facilityId");

-- CreateIndex
CREATE INDEX "Receipt_facilityId_idx" ON "Receipt"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_facilityId_receiptCode_key" ON "Receipt"("facilityId", "receiptCode");

-- CreateIndex
CREATE INDEX "ReferenceParameter_facilityId_idx" ON "ReferenceParameter"("facilityId");

-- CreateIndex
CREATE INDEX "ReferenceRange_facilityId_idx" ON "ReferenceRange"("facilityId");

-- CreateIndex
CREATE INDEX "Report_facilityId_idx" ON "Report"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_facilityId_reportCode_key" ON "Report"("facilityId", "reportCode");

-- CreateIndex
CREATE INDEX "SampleRejection_facilityId_idx" ON "SampleRejection"("facilityId");

-- CreateIndex
CREATE INDEX "ScanAcceptance_facilityId_idx" ON "ScanAcceptance"("facilityId");

-- CreateIndex
CREATE INDEX "ScanBooking_facilityId_idx" ON "ScanBooking"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "ScanBooking_facilityId_bookingCode_key" ON "ScanBooking"("facilityId", "bookingCode");

-- CreateIndex
CREATE INDEX "ScanResult_facilityId_idx" ON "ScanResult"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "ScanResult_facilityId_resultCode_key" ON "ScanResult"("facilityId", "resultCode");

-- CreateIndex
CREATE INDEX "ScanResultFile_facilityId_idx" ON "ScanResultFile"("facilityId");

-- CreateIndex
CREATE INDEX "ScanRetake_facilityId_idx" ON "ScanRetake"("facilityId");

-- CreateIndex
CREATE INDEX "ScanReview_facilityId_idx" ON "ScanReview"("facilityId");

-- CreateIndex
CREATE INDEX "SecureResultLink_facilityId_idx" ON "SecureResultLink"("facilityId");

-- CreateIndex
CREATE INDEX "SystemEvent_facilityId_idx" ON "SystemEvent"("facilityId");

-- CreateIndex
CREATE INDEX "User_facilityId_idx" ON "User"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "User_facilityId_username_key" ON "User"("facilityId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "User_facilityId_email_key" ON "User"("facilityId", "email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContact" ADD CONSTRAINT "PatientContact_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsurance" ADD CONSTRAINT "PatientInsurance_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDuplicateFlag" ADD CONSTRAINT "PatientDuplicateFlag_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceParameter" ADD CONSTRAINT "ReferenceParameter_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceRange" ADD CONSTRAINT "ReferenceRange_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCancellation" ADD CONSTRAINT "OrderCancellation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientVisit" ADD CONSTRAINT "PatientVisit_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSample" ADD CONSTRAINT "LabSample_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResultParameter" ADD CONSTRAINT "LabResultParameter_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResultReview" ADD CONSTRAINT "LabResultReview_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResultAmendment" ADD CONSTRAINT "LabResultAmendment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleRejection" ADD CONSTRAINT "SampleRejection_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityControlRun" ADD CONSTRAINT "QualityControlRun_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAcceptance" ADD CONSTRAINT "ScanAcceptance_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanBooking" ADD CONSTRAINT "ScanBooking_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanResult" ADD CONSTRAINT "ScanResult_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanResultFile" ADD CONSTRAINT "ScanResultFile_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanReview" ADD CONSTRAINT "ScanReview_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanRetake" ADD CONSTRAINT "ScanRetake_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloatTransaction" ADD CONSTRAINT "FloatTransaction_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecureResultLink" ADD CONSTRAINT "SecureResultLink_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiRequestLog" ADD CONSTRAINT "ApiRequestLog_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

