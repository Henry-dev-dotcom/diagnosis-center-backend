import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    failures.push(`Missing file: ${file}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

function assertIncludes(file, needle, label = needle) {
  const content = read(file);
  if (!content.includes(needle)) failures.push(`${file} is missing ${label}`);
}

function assertRegex(file, pattern, label = String(pattern)) {
  const content = read(file);
  if (!pattern.test(content)) failures.push(`${file} does not match ${label}`);
}

const packageJson = JSON.parse(read('package.json') || '{}');
if (!['0.9.0', '1.0.0'].includes(packageJson.version) && !/^([12])\./.test(packageJson.version ?? '')) failures.push('package.json version must be 0.9.0 or later foundation/business version');
if (!packageJson.scripts?.qa?.includes('check-phase')) failures.push('package.json qa script must include a current phase QA script');

assertRegex('src/config/openapi.ts', /version: '(0\.9\.0|[12]\.\d+\.\d+)'/, 'OpenAPI version 0.9.0 or later foundation/business version');
assertRegex('README.md', /Backend Phase (9 — Seed Data|10 — Backend Foundation QA)/, 'README Phase 9 or Phase 10 heading');
assertIncludes('docs/backend-phase-9-seed-data.md', 'Backend Phase 9', 'Phase 9 documentation');
assertIncludes('docs/backend-roadmap.md', 'Phase 9 — Seed Data\nDone in this package.', 'roadmap Phase 9 status');

const seed = read('prisma/seed.ts');
const requiredSeedFunctions = [
  'resetDemoData',
  'seedUsersAndDoctors',
  'seedDepartmentsAndEquipment',
  'seedPatients',
  'seedCatalogAndReferenceRanges',
  'seedOrders',
  'seedReceptionWorkflow',
  'seedLabAndScanWorkflow',
  'seedBillingAndFinance',
  'seedReportsAndNotifications',
  'seedInventoryAndQualityControl',
  'seedAuditAndSystemEvents'
];
for (const fn of requiredSeedFunctions) {
  if (!seed.includes(`async function ${fn}`)) failures.push(`prisma/seed.ts is missing ${fn}()`);
}

const requiredDemoUsers = [
  "username: 'admin'",
  "username: 'doctor'",
  "username: 'reception'",
  "username: 'lab'",
  "username: 'scan'",
  "username: 'billing'"
];
for (const marker of requiredDemoUsers) {
  if (!seed.includes(marker)) failures.push(`prisma/seed.ts is missing seeded user marker ${marker}`);
}

const requiredCodes = [
  'HOSP-001',
  'HOSP-002',
  'DOC-001',
  'DOC-002',
  'PAT-0001',
  'PAT-0002',
  'PAT-0003',
  'ORD-2026-0001',
  'ORD-2026-0006',
  'INV-0001',
  'INV-0006',
  'SMP-0001',
  'RES-0001',
  'RES-0006',
  'RPT-0001',
  'SHIFT-SEED-001',
  'EXP-0001',
  'NOT-001',
  'AUD-001',
  'SYS-0001'
];
for (const code of requiredCodes) {
  if (!seed.includes(code)) failures.push(`prisma/seed.ts is missing deterministic seed code ${code}`);
}

for (let i = 1; i <= 22; i += 1) {
  const code = `id: 't${i}'`;
  if (!seed.includes(code)) failures.push(`prisma/seed.ts is missing catalog item ${code}`);
}

const requiredModelOperations = [
  'prisma.hospital.createMany',
  'prisma.doctorProfile.createMany',
  'prisma.patient.create',
  'prisma.patientContact.create',
  'prisma.patientInsurance.create',
  'prisma.catalogItem.create',
  'prisma.referenceParameter.create',
  'prisma.referenceRange.create',
  'prisma.order.create',
  'prisma.orderItem.create',
  'prisma.orderStatusHistory.create',
  'prisma.appointment.create',
  'prisma.patientVisit.create',
  'prisma.labSample.create',
  'prisma.labResult.create',
  'prisma.labResultParameter.create',
  'prisma.scanAcceptance.create',
  'prisma.scanBooking.create',
  'prisma.scanResult.create',
  'prisma.scanResultFile.create',
  'prisma.invoice.create',
  'prisma.invoiceItem.create',
  'prisma.payment.create',
  'prisma.receipt.create',
  'prisma.cashierShift.create',
  'prisma.floatTransaction.create',
  'prisma.expense.create',
  'prisma.expensePayment.create',
  'prisma.ledgerEntry.create',
  'prisma.report.create',
  'prisma.secureResultLink.create',
  'prisma.notification.create',
  'prisma.deliveryLog.create',
  'prisma.inventoryItem.createMany',
  'prisma.qualityControlRun.createMany',
  'prisma.auditLog.createMany',
  'prisma.systemEvent.createMany'
];
for (const operation of requiredModelOperations) {
  if (!seed.includes(operation)) failures.push(`prisma/seed.ts is missing operation ${operation}`);
}

assertIncludes('prisma/seed.ts', 'hashPassword(DEMO_PASSWORDS', 'hashed demo passwords');
assertIncludes('prisma/seed.ts', 'isDicom: true', 'DICOM-ready scan seed metadata');
assertIncludes('prisma/seed.ts', 'studyUid', 'DICOM study UID seed metadata');
assertIncludes('prisma/seed.ts', 'safeMessage: [\'SMS\'', 'safe SMS/WhatsApp delivery marker');
assertRegex('prisma/seed.ts', /console\.log\('Seeded Backend Phase 9 frontend-compatible demo database\.'\)/, 'Phase 9 seed completion message');

if (failures.length) {
  console.error('Backend Phase 9 seed data static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  phase: 9,
  name: 'Seed Data',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  checks: [
    'package version',
    'qa script',
    'OpenAPI version',
    'README and docs',
    'demo users',
    'hospitals and doctors',
    'patients',
    'full catalog and reference ranges',
    'orders and timelines',
    'reception workflow records',
    'lab workflow records',
    'scan workflow and DICOM-ready metadata',
    'billing and finance records',
    'reports and notifications',
    'inventory/QC records',
    'audit/system events'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-phase-9-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Phase 9 seed data static check passed.');
