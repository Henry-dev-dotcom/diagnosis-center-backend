import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredFiles = [
  'src/middleware/validate.ts',
  'src/middleware/errorHandler.ts',
  'src/types/api.ts',
  'src/validators/common.validators.ts',
  'src/validators/auth.validators.ts',
  'src/validators/patient.validators.ts',
  'src/validators/order.validators.ts',
  'src/validators/lab.validators.ts',
  'src/validators/scan.validators.ts',
  'src/validators/billing.validators.ts',
  'src/validators/finance.validators.ts',
  'src/validators/admin.validators.ts',
  'src/validators/reception.validators.ts',
  'src/validators/result.validators.ts',
  'src/validators/notification.validators.ts',
  'src/validators/file.validators.ts',
  'docs/backend-phase-7-validation-error-handling.md'
];

const missing = requiredFiles.filter((file) => !exists(file));
if (missing.length) {
  console.error('Missing Phase 7 files:', missing.join(', '));
  process.exit(1);
}

const packageJson = JSON.parse(read('package.json'));
if (!['0.7.0', '0.8.0', '0.9.0', '1.0.0'].includes(packageJson.version) && !/^([12])\./.test(packageJson.version ?? '')) {
  console.error(`Expected package version 0.7.0 or later foundation/business version, found ${packageJson.version}.`);
  process.exit(1);
}
if (!packageJson.scripts.qa?.includes('check-phase')) {
  console.error('package.json qa script must include a current validation or later QA script.');
  process.exit(1);
}

const validate = read('src/middleware/validate.ts');
for (const marker of ['validateRequest', 'validateBody', 'validateQuery', 'validateParams', 'schemas.body', 'schemas.query', 'schemas.params']) {
  if (!validate.includes(marker)) {
    console.error(`Missing validation middleware marker: ${marker}`);
    process.exit(1);
  }
}

const errorHandler = read('src/middleware/errorHandler.ts');
for (const marker of ['VALIDATION_FAILED', 'ROUTE_NOT_FOUND', 'UNIQUE_CONSTRAINT_FAILED', 'RESOURCE_NOT_FOUND', 'INTERNAL_SERVER_ERROR', 'requestId', 'timestamp']) {
  if (!errorHandler.includes(marker)) {
    console.error(`Missing standard error marker: ${marker}`);
    process.exit(1);
  }
}

const validatorChecks = [
  ['src/validators/patient.validators.ts', 'createPatientSchema'],
  ['src/validators/patient.validators.ts', 'checkDuplicatesSchema'],
  ['src/validators/order.validators.ts', 'createOrderSchema'],
  ['src/validators/lab.validators.ts', 'acceptSampleSchema'],
  ['src/validators/lab.validators.ts', 'labResultSchema'],
  ['src/validators/scan.validators.ts', 'scanResultSchema'],
  ['src/validators/billing.validators.ts', 'paymentSchema'],
  ['src/validators/finance.validators.ts', 'startShiftSchema'],
  ['src/validators/finance.validators.ts', 'closeShiftSchema'],
  ['src/validators/finance.validators.ts', 'expenseSchema'],
  ['src/validators/admin.validators.ts', 'catalogSchema'],
  ['src/validators/admin.validators.ts', 'referenceRangeSchema']
];

for (const [file, marker] of validatorChecks) {
  if (!read(file).includes(marker)) {
    console.error(`Missing validator marker in ${file}: ${marker}`);
    process.exit(1);
  }
}

const routeValidationChecks = [
  ['src/routes/patients.routes.ts', 'createPatientSchema'],
  ['src/routes/patients.routes.ts', 'checkDuplicatesSchema'],
  ['src/routes/doctors.routes.ts', 'createOrderSchema'],
  ['src/routes/orders.routes.ts', 'updateOrderStatusSchema'],
  ['src/routes/reception.routes.ts', 'checkInSchema'],
  ['src/routes/lab.routes.ts', 'acceptSampleSchema'],
  ['src/routes/lab.routes.ts', 'labResultSchema'],
  ['src/routes/scan.routes.ts', 'scanResultSchema'],
  ['src/routes/billing.routes.ts', 'paymentSchema'],
  ['src/routes/finance.routes.ts', 'startShiftSchema'],
  ['src/routes/finance.routes.ts', 'closeShiftSchema'],
  ['src/routes/finance.routes.ts', 'expenseSchema'],
  ['src/routes/admin.routes.ts', 'catalogSchema'],
  ['src/routes/admin.routes.ts', 'referenceRangeSchema'],
  ['src/routes/results.routes.ts', 'releaseResultSchema'],
  ['src/routes/files.routes.ts', 'fileUploadSchema']
];

for (const [file, marker] of routeValidationChecks) {
  const content = read(file);
  if (!content.includes('validateRequest')) {
    console.error(`Route file is missing validateRequest: ${file}`);
    process.exit(1);
  }
  if (!content.includes(marker)) {
    console.error(`Route validation marker missing in ${file}: ${marker}`);
    process.exit(1);
  }
}

const openApi = read('src/config/openapi.ts');
if (!openApi.includes("'400': { description: 'Validation failed or malformed request payload' }")) {
  console.error('OpenAPI document was not upgraded for Phase 7 validation/error responses.');
  process.exit(1);
}

const apiTypes = read('src/types/api.ts');
for (const marker of ['ApiValidationError', 'code?: string', 'requestId?: string', 'timestamp?: string']) {
  if (!apiTypes.includes(marker)) {
    console.error(`Missing API error type marker: ${marker}`);
    process.exit(1);
  }
}

console.log('Backend Phase 7 validation and error handling static check passed.');
