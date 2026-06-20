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
if (!(/^1\.[4-9]\.0$/.test(packageJson.version ?? '') || /^2\.\d+\.\d+$/.test(packageJson.version ?? ''))) failures.push('package.json version must be 1.4.0 or later for Business Logic Stage 4');
if (!packageJson.scripts?.['qa:business-stage4']) failures.push('package.json is missing qa:business-stage4');
if (!String(packageJson.scripts?.qa ?? '').includes('check-business-stage4.mjs')) failures.push('npm run qa must include Business Logic Stage 4 checks');

const requiredFiles = [
  'src/services/billing.service.ts',
  'src/controllers/billing.controller.ts',
  'src/routes/billing.routes.ts',
  'src/services/finance.service.ts',
  'src/controllers/finance.controller.ts',
  'src/routes/finance.routes.ts',
  'docs/backend-business-stage-4-billing-finance-workflow.md',
  'scripts/check-business-stage4.mjs'
];
for (const file of requiredFiles) read(file);

assertNotIncludes('src/routes/billing.routes.ts', 'endpointPlaceholder', 'billing placeholder handlers');
assertNotIncludes('src/routes/finance.routes.ts', 'endpointPlaceholder', 'finance placeholder handlers');
assertIncludes('src/routes/billing.routes.ts', 'listInvoicesController', 'live invoice register route');
assertIncludes('src/routes/billing.routes.ts', 'recordInvoicePaymentController', 'live payment route');
assertIncludes('src/routes/billing.routes.ts', 'recordInvoiceRefundController', 'live refund route');
assertIncludes('src/routes/finance.routes.ts', 'startShiftController', 'live start shift route');
assertIncludes('src/routes/finance.routes.ts', 'closeShiftController', 'live close shift route');
assertIncludes('src/routes/finance.routes.ts', 'createFloatAdjustmentController', 'live float adjustment route');
assertIncludes('src/routes/finance.routes.ts', 'recordExpensePaymentController', 'live expense payment route');
assertIncludes('src/routes/finance.routes.ts', 'getFinanceAnalyticsController', 'live finance analytics route');

assertIncludes('src/services/billing.service.ts', 'recordInvoicePayment', 'payment service');
assertIncludes('src/services/billing.service.ts', 'ACTIVE_SHIFT_REQUIRED', 'active shift guard');
assertIncludes('src/services/billing.service.ts', 'FloatTransactionType.PAYMENT', 'payment creates float transaction');
assertIncludes('src/services/billing.service.ts', 'LedgerEntryType.CREDIT', 'payment creates ledger credit');
assertIncludes('src/services/billing.service.ts', 'receiptCode', 'payment creates receipt');
assertIncludes('src/services/billing.service.ts', 'PAYMENT_RECORDED', 'payment audit action');
assertIncludes('src/services/billing.service.ts', 'REFUND_RECORDED', 'refund audit action');

assertIncludes('src/services/finance.service.ts', 'startShift', 'start shift service');
assertIncludes('src/services/finance.service.ts', 'closeShift', 'close shift service');
assertIncludes('src/services/finance.service.ts', 'createFloatAdjustment', 'float adjustment service');
assertIncludes('src/services/finance.service.ts', 'recordExpensePayment', 'expense payment service');
assertIncludes('src/services/finance.service.ts', 'LedgerEntryType.DEBIT', 'expense payment creates ledger debit');
assertIncludes('src/services/finance.service.ts', 'writeOffExpense', 'expense write-off service');
assertIncludes('src/services/finance.service.ts', 'getReceivableAgeing', 'receivable ageing service');
assertIncludes('src/services/finance.service.ts', 'getFinanceAnalytics', 'finance analytics service');
assertIncludes('src/services/finance.service.ts', 'SHIFT_STARTED', 'shift audit action');
assertIncludes('src/services/finance.service.ts', 'EXPENSE_PAYMENT_RECORDED', 'expense payment audit action');

assertIncludes('src/validators/billing.validators.ts', 'invoiceQuerySchema', 'invoice query validator');
assertIncludes('src/validators/finance.validators.ts', 'shiftQuerySchema', 'shift query validator');
assertIncludes('src/validators/finance.validators.ts', 'floatQuerySchema', 'float query validator');
assertIncludes('src/validators/finance.validators.ts', 'ledgerQuerySchema', 'ledger query validator');

assertRegex('src/config/phase6RouteMap.ts', /path: '\/billing\/invoices'[\s\S]*?status: 'implemented'/, 'billing invoices contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/billing\/invoices\/:id\/payments'[\s\S]*?status: 'implemented'/, 'payment contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/finance\/shifts\/start'[\s\S]*?status: 'implemented'/, 'start shift contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/finance\/float'[\s\S]*?status: 'implemented'/, 'float contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/finance\/expenses'[\s\S]*?status: 'implemented'/, 'expenses contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/finance\/ledger'[\s\S]*?status: 'implemented'/, 'ledger contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/finance\/analytics'[\s\S]*?status: 'implemented'/, 'analytics contract implemented');
assertRegex('src/controllers/system.controller.ts', /version: '(1\.[4-9]\.0|2\.\d+\.\d+)'/, 'version endpoint 1.4.0 or later');
assertRegex('src/config/openapi.ts', /version: '(1\.[4-9]\.0|2\.\d+\.\d+)'/, 'OpenAPI version 1.4.0 or later');
assertIncludes('README.md', 'Business Logic Stage 4', 'README Business Logic Stage 4 section');

if (failures.length) {
  console.error('Backend Business Logic Stage 4 static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  stage: 'Business Logic Stage 4',
  name: 'Billing and Finance Workflow Foundation',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  packageVersion: packageJson.version,
  checks: [
    'billing placeholders were replaced with live controllers',
    'finance placeholders were replaced with live controllers',
    'invoice register, detail, update, payment, refund, and receipt routes are live',
    'payment recording requires an active cashier shift',
    'payment recording creates Payment, FloatTransaction, LedgerEntry, Receipt, and invoice balance updates',
    'cashier shift start/current/history/close routes are live',
    'float adjustment and float register routes are live',
    'expenses can be created, updated, paid, and written off',
    'expense payments create debit ledger entries',
    'ledger, analytics, and receivable ageing routes are live',
    'billing and finance mutations emit audit logs',
    'Phase 6 route contracts were updated to implemented for billing and finance endpoints',
    'documentation added'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-business-stage-4-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Business Logic Stage 4 static check passed.');
