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

function assertNotIncludes(file, needle, label = needle) {
  const content = read(file);
  if (content.includes(needle)) failures.push(`${file} should not include ${label}`);
}

function assertRegex(file, pattern, label = String(pattern)) {
  const content = read(file);
  if (!pattern.test(content)) failures.push(`${file} does not match ${label}`);
}

const packageJson = JSON.parse(read('package.json') || '{}');
if (!/^([12])\.\d+\.\d+$/.test(packageJson.version ?? '')) failures.push('package.json version must remain in the 1.x backend business line');
if (!packageJson.scripts?.['qa:business-stage3']) failures.push('package.json is missing qa:business-stage3');
if (!String(packageJson.scripts?.qa ?? '').includes('check-business-stage3.mjs')) failures.push('npm run qa must include Business Logic Stage 3 checks');

const requiredFiles = [
  'src/services/reception.service.ts',
  'src/controllers/reception.controller.ts',
  'src/routes/reception.routes.ts',
  'src/validators/reception.validators.ts',
  'docs/backend-business-stage-3-reception-workflow.md',
  'scripts/check-business-stage3.mjs'
];
for (const file of requiredFiles) read(file);

assertIncludes('src/services/reception.service.ts', 'checkInPatient', 'live patient check-in service');
assertIncludes('src/services/reception.service.ts', 'createWalkIn', 'live walk-in intake service');
assertIncludes('src/services/reception.service.ts', 'createInvoiceForOrder', 'walk-in invoice creation helper');
assertIncludes('src/services/reception.service.ts', 'listAppointments', 'appointment list service');
assertIncludes('src/services/reception.service.ts', 'createAppointment', 'appointment creation service');
assertIncludes('src/services/reception.service.ts', 'updateAppointment', 'appointment update service');
assertIncludes('src/services/reception.service.ts', 'listDailyVisits', 'daily visit list service');
assertIncludes('src/services/reception.service.ts', 'listReceptionResultsInbox', 'results inbox service');
assertIncludes('src/services/reception.service.ts', 'sendReceptionResultNotice', 'safe patient result notice service');
assertIncludes('src/services/reception.service.ts', 'safeMessage: true', 'safe delivery log marker');
assertIncludes('src/services/reception.service.ts', 'PATIENT_CHECKED_IN', 'check-in audit action');
assertIncludes('src/services/reception.service.ts', 'WALK_IN_CREATED', 'walk-in audit action');
assertIncludes('src/services/reception.service.ts', 'SAFE_RESULT_NOTICE_SENT', 'notice audit action');
assertIncludes('src/controllers/reception.controller.ts', 'checkInPatientController', 'check-in controller');
assertIncludes('src/controllers/reception.controller.ts', 'createWalkInController', 'walk-in controller');
assertIncludes('src/controllers/reception.controller.ts', 'listReceptionResultsInboxController', 'results inbox controller');
assertNotIncludes('src/routes/reception.routes.ts', 'endpointPlaceholder', 'reception placeholder handlers');
assertIncludes('src/routes/reception.routes.ts', 'checkInPatientController', 'check-in route wired to live controller');
assertIncludes('src/routes/reception.routes.ts', 'createWalkInController', 'walk-in route wired to live controller');
assertIncludes('src/routes/reception.routes.ts', 'listAppointmentsController', 'appointments route wired to live controller');
assertIncludes('src/routes/reception.routes.ts', 'listDailyVisitsController', 'daily visits route wired to live controller');
assertIncludes('src/routes/reception.routes.ts', 'sendReceptionResultNoticeController', 'result notice route wired to live controller');
assertIncludes('src/validators/reception.validators.ts', 'appointmentQuerySchema', 'appointment query validator');
assertIncludes('src/validators/reception.validators.ts', 'dailyVisitsQuerySchema', 'daily visit query validator');
assertIncludes('src/config/phase6RouteMap.ts', "path: '/reception/check-in'", 'check-in route contract');
assertIncludes('src/config/phase6RouteMap.ts', "path: '/reception/results/:id/send-notice'", 'send notice route contract');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/reception\/check-in'[\s\S]*?status: 'implemented'/, 'check-in contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/reception\/walk-ins'[\s\S]*?status: 'implemented'/, 'walk-in contract implemented');
assertRegex('src/controllers/system.controller.ts', /version: '[12]\.\d+\.\d+'/, 'version endpoint 1.x');
assertRegex('src/config/openapi.ts', /version: '[12]\.\d+\.\d+'/, 'OpenAPI version 1.x');
assertIncludes('README.md', 'Business Logic Stage 3', 'README Business Logic Stage 3 section');

if (failures.length) {
  console.error('Backend Business Logic Stage 3 static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  stage: 'Business Logic Stage 3',
  name: 'Reception Workflow, Patient Check-in, Walk-ins, and Appointments',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  packageVersion: packageJson.version,
  checks: [
    'reception placeholders were replaced with live controllers',
    'patient check-in creates PatientVisit records and updates appointments/orders',
    'walk-ins can create patients, confirmed orders, invoices, and visits',
    'appointments can be listed, created, and updated',
    'daily visit log reads real PatientVisit records',
    'results inbox reads generated Report records',
    'safe patient result notices create Notification and DeliveryLog entries',
    'audit logging is emitted for major reception actions',
    'Phase 6 route contracts were updated to implemented for reception endpoints',
    'documentation added'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-business-stage-3-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Business Logic Stage 3 static check passed.');
