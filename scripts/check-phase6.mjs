import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredFiles = [
  'src/routes/auth.routes.ts',
  'src/routes/users.routes.ts',
  'src/routes/patients.routes.ts',
  'src/routes/doctors.routes.ts',
  'src/routes/orders.routes.ts',
  'src/routes/reception.routes.ts',
  'src/routes/lab.routes.ts',
  'src/routes/scan.routes.ts',
  'src/routes/billing.routes.ts',
  'src/routes/finance.routes.ts',
  'src/routes/admin.routes.ts',
  'src/routes/results.routes.ts',
  'src/routes/reports.routes.ts',
  'src/routes/notifications.routes.ts',
  'src/routes/files.routes.ts',
  'src/config/phase6RouteMap.ts',
  'src/controllers/routeContracts.controller.ts',
  'docs/backend-phase-6-api-route-structure.md'
];

const missing = requiredFiles.filter((file) => !exists(file));
if (missing.length) {
  console.error('Missing Phase 6 files:', missing.join(', '));
  process.exit(1);
}

const index = read('src/routes/index.ts');
for (const routeExport of [
  'authRoutes',
  'accessRoutes',
  'usersRoutes',
  'patientsRoutes',
  'doctorsRoutes',
  'ordersRoutes',
  'receptionRoutes',
  'labRoutes',
  'scanRoutes',
  'billingRoutes',
  'financeRoutes',
  'adminRoutes',
  'resultsRoutes',
  'reportsRoutes',
  'notificationsRoutes',
  'filesRoutes'
]) {
  if (!index.includes(routeExport)) {
    console.error(`Route group not registered in src/routes/index.ts: ${routeExport}`);
    process.exit(1);
  }
}

if (index.includes('placeholderRoutes')) {
  console.error('placeholderRoutes must not be registered after Phase 6 route contracts are installed.');
  process.exit(1);
}

const checks = [
  ['src/routes/auth.routes.ts', "post('/auth/login"],
  ['src/routes/auth.routes.ts', "post('/auth/logout"],
  ['src/routes/auth.routes.ts', "post('/auth/refresh"],
  ['src/routes/auth.routes.ts', "get('/auth/me"],
  ['src/routes/patients.routes.ts', "get('/patients"],
  ['src/routes/patients.routes.ts', "post('/patients"],
  ['src/routes/patients.routes.ts', "get('/patients/:id"],
  ['src/routes/patients.routes.ts', "patch('/patients/:id"],
  ['src/routes/patients.routes.ts', "get('/patients/:id/orders"],
  ['src/routes/patients.routes.ts', "get('/patients/:id/trends"],
  ['src/routes/patients.routes.ts', "post('/patients/check-duplicates"],
  ['src/routes/doctors.routes.ts', "get('/doctor/profile"],
  ['src/routes/doctors.routes.ts', "patch('/doctor/profile"],
  ['src/routes/doctors.routes.ts', "get('/doctor/patients"],
  ['src/routes/doctors.routes.ts', "post('/doctor/orders"],
  ['src/routes/doctors.routes.ts', "get('/doctor/orders/active"],
  ['src/routes/doctors.routes.ts', "get('/doctor/orders/completed"],
  ['src/routes/doctors.routes.ts', "get('/doctor/results"],
  ['src/routes/doctors.routes.ts', "get('/doctor/patient-trends/:patientId"],
  ['src/routes/orders.routes.ts', "get('/orders"],
  ['src/routes/orders.routes.ts', "get('/orders/:id"],
  ['src/routes/orders.routes.ts', "patch('/orders/:id/status"],
  ['src/routes/orders.routes.ts', "post('/orders/:id/cancel"],
  ['src/routes/orders.routes.ts', "get('/orders/:id/timeline"],
  ['src/routes/orders.routes.ts', "post('/orders/:id/transition"],
  ['src/routes/reception.routes.ts', "get('/reception/incoming-orders"],
  ['src/routes/reception.routes.ts', "post('/reception/orders/:id/confirm"],
  ['src/routes/reception.routes.ts', "post('/reception/check-in"],
  ['src/routes/reception.routes.ts', "post('/reception/walk-ins"],
  ['src/routes/reception.routes.ts', "get('/reception/appointments"],
  ['src/routes/reception.routes.ts', "post('/reception/appointments"],
  ['src/routes/reception.routes.ts', "patch('/reception/appointments/:id"],
  ['src/routes/reception.routes.ts', "get('/reception/daily-visits"],
  ['src/routes/reception.routes.ts', "get('/reception/results-inbox"],
  ['src/routes/lab.routes.ts', "get('/lab/queue"],
  ['src/routes/lab.routes.ts', "post('/lab/samples/accept"],
  ['src/routes/lab.routes.ts', "post('/lab/orders/:orderId/accept"],
  ['src/routes/lab.routes.ts', "get('/lab/accepted-samples"],
  ['src/routes/lab.routes.ts', "post('/lab/results/draft"],
  ['src/routes/lab.routes.ts', "post('/lab/results'"],
  ['src/routes/lab.routes.ts', "post('/lab/results/submit-review"],
  ['src/routes/lab.routes.ts', "post('/lab/results/:id/sign-off"],
  ['src/routes/lab.routes.ts', "post('/lab/samples/:id/reject"],
  ['src/routes/lab.routes.ts', "get('/lab/review-queue"],
  ['src/routes/lab.routes.ts', "get('/lab/rejected-retest"],
  ['src/routes/lab.routes.ts', "get('/lab/reference-ranges/:catalogItemId"],
  ['src/routes/scan.routes.ts', "get('/scan/queue"],
  ['src/routes/scan.routes.ts', "post('/scan/accept"],
  ['src/routes/scan.routes.ts', "post('/scan/orders/:orderId/accept"],
  ['src/routes/scan.routes.ts', "get('/scan/accepted-scans"],
  ['src/routes/scan.routes.ts', "post('/scan/bookings"],
  ['src/routes/scan.routes.ts', "get('/scan/bookings"],
  ['src/routes/scan.routes.ts', "post('/scan/results/draft"],
  ['src/routes/scan.routes.ts', "post('/scan/results'"],
  ['src/routes/scan.routes.ts', "post('/scan/results/submit-review"],
  ['src/routes/scan.routes.ts', "post('/scan/results/:id/sign-off"],
  ['src/routes/scan.routes.ts', "post('/scan/retake"],
  ['src/routes/scan.routes.ts', "get('/scan/review-queue"],
  ['src/routes/scan.routes.ts', "get('/scan/rejected-retake"],
  ['src/routes/billing.routes.ts', "get('/billing/invoices"],
  ['src/routes/billing.routes.ts', "patch('/billing/invoices/:id"],
  ['src/routes/billing.routes.ts', "post('/billing/invoices/:id/payments"],
  ['src/routes/finance.routes.ts', "post('/finance/shifts/start"],
  ['src/routes/finance.routes.ts', "post('/finance/shifts/:id/close"],
  ['src/routes/finance.routes.ts', "get('/finance/shifts/current"],
  ['src/routes/finance.routes.ts', "get('/finance/shifts'"],
  ['src/routes/finance.routes.ts', "get('/finance/float"],
  ['src/routes/finance.routes.ts', "post('/finance/float/adjustments"],
  ['src/routes/finance.routes.ts', "get('/finance/expenses"],
  ['src/routes/finance.routes.ts', "post('/finance/expenses"],
  ['src/routes/finance.routes.ts', "patch('/finance/expenses/:id"],
  ['src/routes/finance.routes.ts', "post('/finance/expenses/:id/payment"],
  ['src/routes/finance.routes.ts', "post('/finance/expenses/:id/write-off"],
  ['src/routes/finance.routes.ts', "get('/finance/ledger"],
  ['src/routes/finance.routes.ts', "get('/finance/analytics"],
  ['src/routes/admin.routes.ts', "get('/admin/users"],
  ['src/routes/admin.routes.ts', "post('/admin/users"],
  ['src/routes/admin.routes.ts', "patch('/admin/users/:id"],
  ['src/routes/admin.routes.ts', "get('/admin/catalog"],
  ['src/routes/admin.routes.ts', "post('/admin/catalog"],
  ['src/routes/admin.routes.ts', "patch('/admin/catalog/:id"],
  ['src/routes/admin.routes.ts', "get('/admin/reference-ranges"],
  ['src/routes/admin.routes.ts', "post('/admin/reference-ranges"],
  ['src/routes/admin.routes.ts', "patch('/admin/reference-ranges/:id"],
  ['src/routes/admin.routes.ts', "get('/admin/hospitals"],
  ['src/routes/admin.routes.ts', "post('/admin/hospitals"],
  ['src/routes/admin.routes.ts', "get('/admin/doctors"],
  ['src/routes/admin.routes.ts', "post('/admin/doctors"],
  ['src/routes/admin.routes.ts', "get('/admin/audit-logs"],
  ['src/routes/results.routes.ts', "get('/results"],
  ['src/routes/results.routes.ts', "get('/results/delivery-logs"],
  ['src/routes/results.routes.ts', "get('/results/:id"],
  ['src/routes/results.routes.ts', "post('/results/:id/release"],
  ['src/routes/results.routes.ts', "get('/results/:id/report"],
  ['src/routes/results.routes.ts', "post('/results/:id/email"],
  ['src/routes/results.routes.ts', "post('/results/:id/sms"],
  ['src/routes/results.routes.ts', "post('/results/:id/whatsapp"]
];

for (const [file, marker] of checks) {
  if (!read(file).includes(marker)) {
    console.error(`Missing route marker in ${file}: ${marker}`);
    process.exit(1);
  }
}

const resultsRoutes = read('src/routes/results.routes.ts');
const deliveryLogsIndex = resultsRoutes.indexOf("get('/results/delivery-logs");
const resultDetailIndex = resultsRoutes.indexOf("get('/results/:id");
if (deliveryLogsIndex === -1 || resultDetailIndex === -1 || deliveryLogsIndex > resultDetailIndex) {
  console.error('/results/delivery-logs must be registered before /results/:id to avoid route shadowing.');
  process.exit(1);
}

const routeMap = read('src/config/phase6RouteMap.ts');
for (const marker of [
  'PHASE6_ROUTE_CONTRACTS',
  '/access/route-contracts',
  '/lab/orders/:orderId/accept',
  '/scan/orders/:orderId/accept',
  '/results/delivery-logs',
  'frontendAlias',
  'privacyNote'
]) {
  if (!routeMap.includes(marker)) {
    console.error(`Missing Phase 6 route map marker: ${marker}`);
    process.exit(1);
  }
}

const accessRoutes = read('src/routes/access.routes.ts');
if (!accessRoutes.includes("get('/access/route-contracts")) {
  console.error('Phase 6 route contract endpoint is not registered.');
  process.exit(1);
}

const openApi = read('src/config/openapi.ts');
if (!openApi.includes('PHASE6_ROUTE_CONTRACTS')) {
  console.error('OpenAPI document was not upgraded for Phase 6 route contracts.');
  process.exit(1);
}

const packageJson = JSON.parse(read('package.json'));
if (!['0.6.0', '0.7.0', '0.8.0', '0.9.0', '1.0.0'].includes(packageJson.version) && !/^([12])\./.test(packageJson.version ?? '')) {
  console.error(`Expected package version 0.6.0 or later foundation/business version, found ${packageJson.version}.`);
  process.exit(1);
}
if (!packageJson.scripts.qa?.includes('check-phase')) {
  console.error('package.json qa script must include a current phase QA script.');
  process.exit(1);
}

console.log('Backend Phase 6 API route structure static check passed.');
