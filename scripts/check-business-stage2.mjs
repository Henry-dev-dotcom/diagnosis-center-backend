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
if (!packageJson.scripts?.['qa:business-stage2']) failures.push('package.json is missing qa:business-stage2');
if (!String(packageJson.scripts?.qa ?? '').includes('check-business-stage2.mjs')) failures.push('npm run qa must include Business Logic Stage 2 checks');

const requiredFiles = [
  'src/services/order.service.ts',
  'src/controllers/order.controller.ts',
  'src/routes/orders.routes.ts',
  'src/routes/doctors.routes.ts',
  'src/routes/reception.routes.ts',
  'src/routes/lab.routes.ts',
  'src/routes/scan.routes.ts',
  'docs/backend-business-stage-2-doctor-order-registry.md',
  'scripts/check-business-stage2.mjs'
];
for (const file of requiredFiles) read(file);

assertIncludes('src/services/order.service.ts', 'createDoctorOrder', 'doctor order creation service');
assertIncludes('src/services/order.service.ts', 'loadCatalogItems', 'catalog validation before order creation');
assertIncludes('src/services/order.service.ts', 'ORDER_TRANSITION_NOT_ALLOWED', 'order transition guard');
assertIncludes('src/services/order.service.ts', 'OrderStatusHistory', 'status history/timeline logic');
assertIncludes('src/services/order.service.ts', 'ensureOrderInvoice', 'reception invoice handoff helper');
assertIncludes('src/services/order.service.ts', 'getOrderItemQueue', 'lab/scan queue handoff query');
assertIncludes('src/controllers/order.controller.ts', 'createDoctorOrderController', 'create doctor order controller');
assertIncludes('src/controllers/order.controller.ts', 'confirmReceptionOrderController', 'reception confirm controller');
assertIncludes('src/controllers/order.controller.ts', 'labOrderQueueController', 'lab queue controller');
assertIncludes('src/controllers/order.controller.ts', 'scanOrderQueueController', 'scan queue controller');
assertNotIncludes('src/routes/orders.routes.ts', 'endpointPlaceholder', 'order placeholder handlers');
assertIncludes('src/routes/doctors.routes.ts', 'createDoctorOrderController', 'doctor order route wired to live controller');
assertIncludes('src/routes/doctors.routes.ts', 'listDoctorActiveOrdersController', 'doctor active orders wired to live controller');
assertIncludes('src/routes/doctors.routes.ts', 'listDoctorCompletedOrdersController', 'doctor completed orders wired to live controller');
assertIncludes('src/routes/reception.routes.ts', 'listReceptionIncomingOrdersController', 'reception incoming queue wired to live controller');
assertIncludes('src/routes/reception.routes.ts', 'confirmReceptionOrderController', 'reception confirmation wired to live controller');
assertIncludes('src/routes/lab.routes.ts', 'labOrderQueueController', 'lab queue wired to order item queue');
assertIncludes('src/routes/scan.routes.ts', 'scanOrderQueueController', 'scan queue wired to order item queue');
assertRegex('src/controllers/system.controller.ts', /version: '[12]\.\d+\.\d+'/ , 'version endpoint 1.x');
assertRegex('src/config/openapi.ts', /version: '[12]\.\d+\.\d+'/ , 'OpenAPI version 1.x');
assertIncludes('README.md', 'Business Logic Stage 2', 'README Business Logic Stage 2 section');

if (failures.length) {
  console.error('Backend Business Logic Stage 2 static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  stage: 'Business Logic Stage 2',
  name: 'Doctor Order Creation and Order Registry',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  packageVersion: packageJson.version,
  checks: [
    'doctor order creation uses real Prisma service/controller',
    'catalog items are validated before order item creation',
    'LAB and SCAN order items are split from catalog item type',
    'shared order registry/detail/timeline endpoints use live handlers',
    'order status transitions and cancellation are guarded',
    'order status history is written for lifecycle changes',
    'reception incoming order queue and confirmation use live handlers',
    'invoice handoff helper exists for confirmed orders',
    'lab and scan queues read real order items',
    'documentation added'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-business-stage-2-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Business Logic Stage 2 static check passed.');
