import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schemaPath = path.join(root, 'prisma/schema.prisma');

const requiredFiles = [
  'prisma/schema.prisma',
  'prisma/seed.ts',
  'src/services/database.service.ts',
  'docs/backend-phase-3-core-database-schema.md',
  'scripts/check-phase3.mjs'
];

const requiredModels = [
  'User',
  'UserSession',
  'PasswordResetToken',
  'Hospital',
  'DoctorProfile',
  'Patient',
  'PatientContact',
  'PatientInsurance',
  'PatientDuplicateFlag',
  'Department',
  'Equipment',
  'CatalogItem',
  'ReferenceParameter',
  'ReferenceRange',
  'Order',
  'OrderItem',
  'OrderStatusHistory',
  'OrderCancellation',
  'Appointment',
  'PatientVisit',
  'LabSample',
  'LabResult',
  'LabResultParameter',
  'LabResultReview',
  'LabResultAmendment',
  'SampleRejection',
  'QualityControlRun',
  'InventoryItem',
  'InventoryTransaction',
  'ScanAcceptance',
  'ScanBooking',
  'ScanResult',
  'ScanResultFile',
  'ScanReview',
  'ScanRetake',
  'Invoice',
  'InvoiceItem',
  'Payment',
  'CashierShift',
  'FloatTransaction',
  'Expense',
  'ExpensePayment',
  'LedgerEntry',
  'Receipt',
  'Report',
  'Notification',
  'DeliveryLog',
  'SecureResultLink',
  'AuditLog',
  'SystemEvent',
  'ApiRequestLog'
];

const requiredEnums = [
  'UserRole',
  'OrderStatus',
  'OrderUrgency',
  'OrderItemStatus',
  'LabSampleStatus',
  'LabResultStatus',
  'ResultFlag',
  'ScanStatus',
  'InvoiceStatus',
  'PaymentMethod',
  'ShiftStatus',
  'FloatTransactionType',
  'ExpenseStatus',
  'LedgerEntryType',
  'DeliveryChannel',
  'DeliveryStatus'
];

const requiredRelationshipMarkers = [
  'doctor DoctorProfile?',
  'items OrderItem[]',
  'labSample LabSample?',
  'scanAcceptance ScanAcceptance?',
  'invoice Invoice?',
  'parameters LabResultParameter[]',
  'files ScanResultFile[]',
  'payments Payment[]',
  'floatTransactions FloatTransaction[]',
  'ledgerEntries LedgerEntry[]',
  'deliveryLogs DeliveryLog[]',
  'isDicom     Boolean',
  'studyUid    String?',
  'criticalLow     Decimal?',
  'criticalHigh    Decimal?'
];

const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missingFiles.length) {
  console.error('Missing required files:', missingFiles);
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, 'utf8');

const missingModels = requiredModels.filter((model) => !schema.includes(`model ${model} `));
if (missingModels.length) {
  console.error('Missing required Prisma models:', missingModels);
  process.exit(1);
}

const missingEnums = requiredEnums.filter((enumName) => !schema.includes(`enum ${enumName} `));
if (missingEnums.length) {
  console.error('Missing required Prisma enums:', missingEnums);
  process.exit(1);
}

const missingRelationshipMarkers = requiredRelationshipMarkers.filter((marker) => !schema.includes(marker));
if (missingRelationshipMarkers.length) {
  console.error('Missing required relationship/schema markers:', missingRelationshipMarkers);
  process.exit(1);
}

const databaseService = fs.readFileSync(path.join(root, 'src/services/database.service.ts'), 'utf8');
const requiredSummaryMarkers = ['labSamples', 'scanResults', 'cashierShifts', 'deliveryLogs', 'ledgerEntries'];
const missingSummaryMarkers = requiredSummaryMarkers.filter((marker) => !databaseService.includes(marker));
if (missingSummaryMarkers.length) {
  console.error('Database summary is missing markers:', missingSummaryMarkers);
  process.exit(1);
}

console.log('Backend Phase 3 core database schema static check passed.');
