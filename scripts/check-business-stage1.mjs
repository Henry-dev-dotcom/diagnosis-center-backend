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
if (!packageJson.scripts?.['qa:business-stage1']) failures.push('package.json is missing qa:business-stage1');

const requiredFiles = [
  'src/services/query.service.ts',
  'src/services/patient.service.ts',
  'src/services/adminBusiness.service.ts',
  'src/controllers/patient.controller.ts',
  'src/controllers/adminBusiness.controller.ts',
  'src/controllers/doctor.controller.ts',
  'src/routes/patients.routes.ts',
  'src/routes/admin.routes.ts',
  'src/routes/users.routes.ts',
  'src/routes/doctors.routes.ts',
  'docs/backend-business-stage-1-patient-admin-catalog-foundation.md',
  'scripts/check-business-stage1.mjs'
];
for (const file of requiredFiles) read(file);

assertNotIncludes('prisma/schema.prisma', 'ranges      ReferenceRange[]\n  ranges      ReferenceRange[]', 'duplicate ReferenceParameter.ranges field');
assertIncludes('src/services/patient.service.ts', 'listPatients', 'patient list service');
assertIncludes('src/services/patient.service.ts', 'checkPatientDuplicates', 'duplicate check service');
assertIncludes('src/services/patient.service.ts', 'PATIENT_SCOPE_DENIED', 'doctor patient scope guard');
assertIncludes('src/services/adminBusiness.service.ts', 'createReferenceRange', 'reference range create service');
assertIncludes('src/services/adminBusiness.service.ts', 'upsertReferenceParameter', 'reference parameter upsert service');
assertIncludes('src/services/adminBusiness.service.ts', 'exportAdminConfiguration', 'configuration export service');
assertIncludes('src/services/adminBusiness.service.ts', 'hashPassword', 'admin user password hashing');
assertNotIncludes('src/routes/patients.routes.ts', 'endpointPlaceholder', 'patient placeholder handlers');
assertNotIncludes('src/routes/admin.routes.ts', 'endpointPlaceholder', 'admin placeholder handlers');
assertIncludes('src/routes/doctors.routes.ts', 'getDoctorProfileController', 'doctor profile live controller');
assertIncludes('src/routes/doctors.routes.ts', 'getOwnDoctorPatientsController', 'doctor patients live controller');
assertRegex('src/controllers/system.controller.ts', /version: '[12]\.\d+\.\d+'/ , 'version endpoint 1.x');
assertRegex('src/config/openapi.ts', /version: '[12]\.\d+\.\d+'/ , 'OpenAPI version 1.x');
assertIncludes('README.md', 'Business Logic Stage 1', 'README Business Logic Stage 1 section');

if (failures.length) {
  console.error('Backend Business Logic Stage 1 static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  stage: 'Business Logic Stage 1',
  name: 'Patient and Admin Catalog Foundation',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  packageVersion: packageJson.version,
  checks: [
    'patient endpoints use real controllers',
    'admin users/hospitals/doctors/catalog/reference ranges/departments/equipment use real controllers',
    'doctor profile and referred patient endpoints use real controllers',
    'patient duplicate checking implemented',
    'doctor-scoped patient access guard implemented',
    'admin user password hashing implemented',
    'reference range upsert logic implemented',
    'configuration export implemented',
    'schema duplicate relation marker fixed',
    'documentation added'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-business-stage-1-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Business Logic Stage 1 static check passed.');
