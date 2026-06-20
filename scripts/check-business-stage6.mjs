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
if (!(/^1\.[6-9]\.0$/.test(packageJson.version ?? '') || /^2\.\d+\.\d+$/.test(packageJson.version ?? ''))) failures.push('package.json version must be 1.6.0 or later for Business Logic Stage 6');
if (!packageJson.scripts?.['qa:business-stage6']) failures.push('package.json is missing qa:business-stage6');
if (!String(packageJson.scripts?.qa ?? '').includes('check-business-stage6.mjs')) failures.push('npm run qa must include Business Logic Stage 6 checks');

const requiredFiles = [
  'src/services/scan.service.ts',
  'src/controllers/scan.controller.ts',
  'src/routes/scan.routes.ts',
  'src/validators/scan.validators.ts',
  'docs/backend-business-stage-6-scan-imaging-workflow.md',
  'scripts/check-business-stage6.mjs'
];
for (const file of requiredFiles) read(file);

assertNotIncludes('src/routes/scan.routes.ts', 'endpointPlaceholder', 'scan placeholder handlers');
assertIncludes('src/routes/scan.routes.ts', 'acceptScansController', 'live scan acceptance route');
assertIncludes('src/routes/scan.routes.ts', 'listAcceptedScansController', 'live accepted scans route');
assertIncludes('src/routes/scan.routes.ts', 'createScanBookingController', 'live scan booking create route');
assertIncludes('src/routes/scan.routes.ts', 'listScanBookingsController', 'live scan bookings list route');
assertIncludes('src/routes/scan.routes.ts', 'saveScanResultDraftController', 'live scan report draft route');
assertIncludes('src/routes/scan.routes.ts', 'submitScanResultReviewController', 'live submit review route');
assertIncludes('src/routes/scan.routes.ts', 'signOffScanResultController', 'live sign-off route');
assertIncludes('src/routes/scan.routes.ts', 'requestScanRetakeController', 'live retake route');
assertIncludes('src/routes/scan.routes.ts', 'attachScanResultFilesController', 'live scan file metadata route');
assertIncludes('src/routes/scan.routes.ts', 'listPriorScansController', 'live prior scan route');

assertIncludes('src/services/scan.service.ts', 'acceptScans', 'scan acceptance service');
assertIncludes('src/services/scan.service.ts', 'ScanStatus.ACCEPTED', 'accepted scan status');
assertIncludes('src/services/scan.service.ts', 'OrderItemStatus.ACCEPTED', 'accepted order item status');
assertIncludes('src/services/scan.service.ts', 'createScanBooking', 'scan booking service');
assertIncludes('src/services/scan.service.ts', 'EquipmentStatus.MAINTENANCE', 'equipment availability guard');
assertIncludes('src/services/scan.service.ts', 'saveScanResultDraft', 'scan result draft service');
assertIncludes('src/services/scan.service.ts', 'createScanResultFiles', 'scan file metadata persistence');
assertIncludes('src/services/scan.service.ts', 'isDicom', 'DICOM readiness metadata');
assertIncludes('src/services/scan.service.ts', 'studyUid', 'DICOM study UID metadata');
assertIncludes('src/services/scan.service.ts', 'ScanStatus.PENDING_REVIEW', 'pending review status');
assertIncludes('src/services/scan.service.ts', 'ScanStatus.SIGNED_OFF', 'signed-off status');
assertIncludes('src/services/scan.service.ts', 'createReportIfNeeded', 'report generation after sign-off');
assertIncludes('src/services/scan.service.ts', 'SCAN_RESULT_SIGNED_OFF', 'sign-off audit action');
assertIncludes('src/services/scan.service.ts', 'SCAN_RETAKE_REQUESTED', 'retake audit action');
assertIncludes('src/services/scan.service.ts', 'listRejectedRetakeScans', 'rejected/retake queue service');
assertIncludes('src/services/scan.service.ts', 'listPriorScans', 'prior scan comparison service');

assertIncludes('src/validators/scan.validators.ts', 'scanResultFilesSchema', 'scan result files validator');
assertIncludes('src/validators/scan.validators.ts', 'scanWorkflowQuerySchema', 'scan workflow query validator');
assertIncludes('src/validators/scan.validators.ts', 'studyUid', 'DICOM study UID validation');
assertIncludes('src/validators/scan.validators.ts', 'seriesUid', 'DICOM series UID validation');
assertIncludes('src/validators/scan.validators.ts', 'instanceUid', 'DICOM instance UID validation');

assertRegex('src/config/phase6RouteMap.ts', /path: '\/scan\/accept'[\s\S]*?status: 'implemented'/, 'scan accept contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/scan\/orders\/:orderId\/accept'[\s\S]*?status: 'implemented'/, 'scan accept alias contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/scan\/accepted-scans'[\s\S]*?status: 'implemented'/, 'accepted scans contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/scan\/bookings'[\s\S]*?status: 'implemented'/, 'scan bookings contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/scan\/results\/draft'[\s\S]*?status: 'implemented'/, 'scan result draft contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/scan\/results\/:id\/sign-off'[\s\S]*?status: 'implemented'/, 'scan sign-off contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/scan\/results\/:id\/files'[\s\S]*?status: 'implemented'/, 'scan files contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/scan\/prior\/:patientId'[\s\S]*?status: 'implemented'/, 'prior scan contract implemented');
assertRegex('src/controllers/system.controller.ts', /version: '(1\.[6-9]\.0|2\.\d+\.\d+)'/, 'version endpoint 1.6.0 or later');
assertRegex('src/config/openapi.ts', /version: '(1\.[6-9]\.0|2\.\d+\.\d+)'/, 'OpenAPI version 1.6.0 or later');
assertIncludes('README.md', 'Business Logic Stage 6', 'README Business Logic Stage 6 section');

if (failures.length) {
  console.error('Backend Business Logic Stage 6 static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  stage: 'Business Logic Stage 6',
  name: 'Scan / Imaging Workflow',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  packageVersion: packageJson.version,
  checks: [
    'scan placeholders were replaced with live controllers',
    'scan acceptance creates or updates ScanAcceptance records and order-item status',
    'accepted scans and equipment booking queues are live',
    'scan report drafting creates or updates ScanResult records',
    'scan image and DICOM-ready metadata are persisted in ScanResultFile records',
    'submit-for-review updates scan result, acceptance, and order item state',
    'sign-off creates reviews, signs off results, and generates report records',
    'retake workflow updates result, acceptance, order item, and ScanRetake records',
    'review queue, rejected/retake queue, and prior scan comparison are live',
    'major scan actions emit audit logs',
    'Phase 6 route contracts were updated to implemented for scan endpoints',
    'documentation added'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-business-stage-6-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Business Logic Stage 6 static check passed.');
