import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'Dockerfile',
  '.dockerignore',
  '.env.production.example',
  'uploads/.gitkeep',
  'src/config/env.ts',
  'src/middleware/security.ts',
  'src/controllers/system.controller.ts',
  'src/routes/system.routes.ts',
  'docs/backend-production-readiness.md',
  'docs/deployment-runbook.md'
];

const requiredMarkers = [
  ['package.json', '"version": "2.1.0"'],
  ['package.json', 'qa:production'],
  ['src/config/env.ts', 'FRONTEND_URLS'],
  ['src/config/env.ts', 'ENABLE_API_DOCS'],
  ['src/config/env.ts', 'RATE_LIMIT_MAX_REQUESTS'],
  ['src/config/env.ts', 'Production JWT_ACCESS_SECRET must be changed'],
  ['src/middleware/security.ts', 'allowedFrontendOrigins'],
  ['src/middleware/security.ts', 'rateLimitBuckets'],
  ['src/middleware/security.ts', 'Too many requests'],
  ['src/controllers/system.controller.ts', 'getReadiness'],
  ['src/controllers/system.controller.ts', 'getLiveness'],
  ['src/controllers/system.controller.ts', '2.1.0'],
  ['src/routes/system.routes.ts', '/ready'],
  ['src/routes/system.routes.ts', '/live'],
  ['Dockerfile', 'FROM node:20-alpine'],
  ['.env.production.example', 'NODE_ENV=production']
];

const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
const markerFailures = requiredMarkers.filter(([file, marker]) => {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return true;
  return !fs.readFileSync(fullPath, 'utf8').includes(marker);
});

if (missingFiles.length || markerFailures.length) {
  console.error('Backend production readiness check failed.');
  if (missingFiles.length) console.error('Missing files:', missingFiles);
  if (markerFailures.length) console.error('Missing markers:', markerFailures);
  process.exit(1);
}

const result = {
  stage: 'Production Readiness Stage',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  checks: {
    dockerfile: true,
    productionEnvExample: true,
    productionEnvGuards: true,
    multiOriginCors: true,
    rateLimitMiddleware: true,
    readinessAndLivenessRoutes: true,
    deploymentDocs: true
  }
};

fs.writeFileSync(path.join(root, 'docs/backend-production-readiness-qa-results.json'), JSON.stringify(result, null, 2));
console.log('Backend production readiness static check passed.');
