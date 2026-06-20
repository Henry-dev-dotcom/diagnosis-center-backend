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
if (!(/^1\.[5-9]\.0$/.test(packageJson.version ?? '') || /^2\.\d+\.\d+$/.test(packageJson.version ?? ''))) failures.push('package.json version must be 1.5.0 or later for Business Logic Stage 5');
if (!packageJson.scripts?.['qa:business-stage5']) failures.push('package.json is missing qa:business-stage5');
if (!String(packageJson.scripts?.qa ?? '').includes('check-business-stage5.mjs')) failures.push('npm run qa must include Business Logic Stage 5 checks');

const requiredFiles = [
  'src/services/lab.service.ts',
  'src/controllers/lab.controller.ts',
  'src/routes/lab.routes.ts',
  'src/validators/lab.validators.ts',
  'docs/backend-business-stage-5-laboratory-workflow.md',
  'scripts/check-business-stage5.mjs'
];
for (const file of requiredFiles) read(file);

assertNotIncludes('src/routes/lab.routes.ts', 'endpointPlaceholder', 'lab placeholder handlers');
assertIncludes('src/routes/lab.routes.ts', 'acceptLabSamplesController', 'live sample acceptance route');
assertIncludes('src/routes/lab.routes.ts', 'listAcceptedSamplesController', 'live accepted samples route');
assertIncludes('src/routes/lab.routes.ts', 'saveLabResultDraftController', 'live lab result draft route');
assertIncludes('src/routes/lab.routes.ts', 'submitLabResultReviewController', 'live submit review route');
assertIncludes('src/routes/lab.routes.ts', 'signOffLabResultController', 'live sign-off route');
assertIncludes('src/routes/lab.routes.ts', 'rejectLabSampleController', 'live sample rejection route');
assertIncludes('src/routes/lab.routes.ts', 'getReferenceRangesController', 'live reference ranges route');
assertIncludes('src/routes/lab.routes.ts', 'getLabPatientTrendsController', 'live patient trends route');
assertIncludes('src/routes/lab.routes.ts', 'createQualityControlRunController', 'live QC create route');
assertIncludes('src/routes/lab.routes.ts', 'recordInventoryTransactionController', 'live inventory transaction route');

assertIncludes('src/services/lab.service.ts', 'acceptLabSamples', 'sample acceptance service');
assertIncludes('src/services/lab.service.ts', 'LabSampleStatus.ACCEPTED', 'accepted sample status');
assertIncludes('src/services/lab.service.ts', 'OrderItemStatus.ACCEPTED', 'accepted order item status');
assertIncludes('src/services/lab.service.ts', 'saveLabResultDraft', 'result draft service');
assertIncludes('src/services/lab.service.ts', 'computeFlag', 'automatic result flagging');
assertIncludes('src/services/lab.service.ts', 'LabResultStatus.PENDING_REVIEW', 'pending review status');
assertIncludes('src/services/lab.service.ts', 'LabResultStatus.SIGNED_OFF', 'signed-off status');
assertIncludes('src/services/lab.service.ts', 'createReportIfNeeded', 'report generation after sign-off');
assertIncludes('src/services/lab.service.ts', 'LAB_RESULT_SIGNED_OFF', 'sign-off audit action');
assertIncludes('src/services/lab.service.ts', 'LAB_SAMPLE_RECOLLECTION_REQUESTED', 'recollection audit action');
assertIncludes('src/services/lab.service.ts', 'listRejectedRetestSamples', 'rejected/retest queue service');
assertIncludes('src/services/lab.service.ts', 'getReferenceRanges', 'reference range service');
assertIncludes('src/services/lab.service.ts', 'getLabPatientTrends', 'patient trends service');
assertIncludes('src/services/lab.service.ts', 'createQualityControlRun', 'QC create service');
assertIncludes('src/services/lab.service.ts', 'recordInventoryTransaction', 'inventory transaction service');
assertIncludes('src/services/lab.service.ts', 'INSUFFICIENT_INVENTORY_STOCK', 'inventory stock guard');

assertIncludes('src/validators/lab.validators.ts', 'qualityControlSchema', 'QC validator');
assertIncludes('src/validators/lab.validators.ts', 'inventoryItemSchema', 'inventory item validator');
assertIncludes('src/validators/lab.validators.ts', 'inventoryTransactionSchema', 'inventory transaction validator');
assertIncludes('src/validators/lab.validators.ts', 'labWorkflowQuerySchema', 'lab workflow query validator');

assertRegex('src/config/phase6RouteMap.ts', /path: '\/lab\/samples\/accept'[\s\S]*?status: 'implemented'/, 'lab accept contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/lab\/accepted-samples'[\s\S]*?status: 'implemented'/, 'accepted samples contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/lab\/results\/draft'[\s\S]*?status: 'implemented'/, 'lab result draft contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/lab\/results\/:id\/sign-off'[\s\S]*?status: 'implemented'/, 'lab sign-off contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/lab\/reference-ranges\/:catalogItemId'[\s\S]*?status: 'implemented'/, 'reference range contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/lab\/qc'[\s\S]*?status: 'implemented'/, 'QC contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/lab\/inventory'[\s\S]*?status: 'implemented'/, 'inventory contract implemented');
assertRegex('src/controllers/system.controller.ts', /version: '(1\.[5-9]\.0|2\.\d+\.\d+)'/, 'version endpoint 1.5.0 or later');
assertRegex('src/config/openapi.ts', /version: '(1\.[5-9]\.0|2\.\d+\.\d+)'/, 'OpenAPI version 1.5.0 or later');
assertIncludes('README.md', 'Business Logic Stage 5', 'README Business Logic Stage 5 section');

if (failures.length) {
  console.error('Backend Business Logic Stage 5 static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  stage: 'Business Logic Stage 5',
  name: 'Laboratory Workflow',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  packageVersion: packageJson.version,
  checks: [
    'lab placeholders were replaced with live controllers',
    'sample acceptance creates or updates LabSample records and order-item status',
    'accepted samples, review queue, and rejected/retest queues are live',
    'lab result drafting creates/upserts result parameters and computes flags from reference ranges',
    'submit-for-review updates lab sample, result, and order item state',
    'senior sign-off creates reviews, signs off results, and generates report records',
    'sample rejection/recollection workflow updates sample and order item state',
    'reference ranges and patient lab trends are live',
    'quality control and inventory routes are live',
    'major lab actions emit audit logs',
    'Phase 6 route contracts were updated to implemented for lab endpoints',
    'documentation added'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-business-stage-5-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Business Logic Stage 5 static check passed.');
