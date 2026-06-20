import { spawnSync } from 'node:child_process';
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

function assertScript(packageJson, name) {
  if (!packageJson.scripts?.[name]) failures.push(`package.json is missing script ${name}`);
}

const packageJson = JSON.parse(read('package.json') || '{}');
if (!/^([12])\./.test(packageJson.version ?? '')) failures.push('package.json version must be in the backend foundation/business release line');
if (!packageJson.scripts?.qa?.includes('check-phase10.mjs')) failures.push('package.json qa script must still include check-phase10.mjs');
for (const script of ['dev', 'start', 'build', 'typecheck', 'lint', 'qa', 'qa:phases', 'qa:static', 'qa:runtime', 'qa:full', 'db:status', 'health:local', 'prisma:generate', 'prisma:migrate', 'prisma:seed', 'prisma:studio', 'prisma:reset']) {
  assertScript(packageJson, script);
}

const requiredFiles = [
  'README.md',
  '.env.example',
  'docker-compose.yml',
  'eslint.config.js',
  'src/app.ts',
  'src/server.ts',
  'src/config/env.ts',
  'src/config/openapi.ts',
  'src/config/phase6RouteMap.ts',
  'src/config/permissions.ts',
  'src/config/routeAccess.ts',
  'src/middleware/errorHandler.ts',
  'src/middleware/validate.ts',
  'src/middleware/auth.ts',
  'src/middleware/audit.ts',
  'src/services/prisma.service.ts',
  'src/services/database.service.ts',
  'src/services/auth.service.ts',
  'src/services/audit.service.ts',
  'prisma/schema.prisma',
  'prisma/seed.ts',
  'docs/backend-roadmap.md',
  'docs/project-tree.txt',
  'docs/backend-phase-10-foundation-qa.md',
  'docs/backend-foundation-local-qa-checklist.md',
  'scripts/check-all-phases.mjs',
  'scripts/check-phase10.mjs'
];
for (const file of requiredFiles) read(file);

assertRegex('src/config/openapi.ts', /version: '([12])\.\d+\.\d+'/, 'OpenAPI release version');
assertRegex('src/controllers/system.controller.ts', /version: '([12])\.\d+\.\d+'/, 'version endpoint release version');
assertIncludes('src/controllers/system.controller.ts', 'Backend', 'version endpoint backend label');
assertIncludes('README.md', 'Business Logic Stage 10', 'README Stage 10 heading');
assertIncludes('README.md', 'diagnosis-center-backend-business-stage10-frontend-live-api-final-qa.zip', 'Stage 10 ZIP name');
assertIncludes('docs/backend-roadmap.md', 'Phase 10 — Backend Foundation QA\nDone in this package.', 'roadmap Phase 10 status');
assertIncludes('docs/backend-phase-10-foundation-qa.md', 'Backend Phase 10', 'Phase 10 documentation');
assertIncludes('docs/backend-foundation-local-qa-checklist.md', 'npm run qa:full', 'local QA checklist full QA command');
assertIncludes('.env.example', 'DATABASE_URL=', 'database URL env');
assertIncludes('.env.example', 'JWT_ACCESS_SECRET=', 'access token secret env');
assertIncludes('.env.example', 'JWT_REFRESH_SECRET=', 'refresh token secret env');
assertIncludes('docker-compose.yml', 'postgres:16-alpine', 'PostgreSQL 16 service');
assertIncludes('docker-compose.yml', 'healthcheck:', 'Docker healthcheck');
assertIncludes('src/app.ts', '/docs', 'Swagger docs registration');
assertIncludes('src/app.ts', 'apiRequestLogger', 'global API request logger');
assertRegex('src/config/phase6RouteMap.ts', /method: 'GET'[\s\S]*path: '\/health'/, 'health route contract');
assertIncludes('src/config/phase6RouteMap.ts', '/admin/audit-logs', 'admin audit route contract');
assertIncludes('src/config/phase6RouteMap.ts', '/results/delivery-logs', 'frontend results delivery alias');
assertIncludes('prisma/seed.ts', 'admin123', 'demo admin password');
assertIncludes('prisma/seed.ts', 'doctor123', 'demo doctor password');
assertIncludes('prisma/seed.ts', 'billing123', 'demo billing password');

// Phase-chain checks are handled by npm run qa:phases. Avoid recursive invocation because check-all-phases includes Phase 10.
if (failures.length) {
  console.error('Backend Phase 10 foundation QA static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  phase: 10,
  name: 'Backend Foundation QA',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  packageVersion: packageJson.version,
  checks: [
    'package version and scripts',
    'phase-chain static QA command registered for phases 1 through 10',
    'required foundation files',
    'environment template',
    'Docker PostgreSQL healthcheck',
    'OpenAPI/Swagger version and path readiness',
    'version endpoint freshness',
    'route contract readiness',
    'seed account markers',
    'documentation and local QA checklist'
  ],
  localRuntimeChecksToRunAfterExtracting: [
    'npm install',
    'npm run prisma:generate',
    'npm run build',
    'npm run lint',
    'docker compose up -d',
    'npm run prisma:migrate',
    'npm run prisma:seed',
    'npm run db:status',
    'npm run dev',
    'npm run health:local'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-phase-10-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Phase 10 foundation QA static check passed.');
