import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const requiredFiles = [
  'docs/backend-business-stage-10-frontend-live-api-final-qa.md',
  'docs/full-system-local-runbook.md',
  'docs/frontend-live-api-integration-contract.md',
  'scripts/check-business-stage10.mjs'
];

const requiredMarkers = [
  ['package.json', 'qa:business-stage10'],
  ['package.json', 'qa:full-system'],
  ['scripts/check-all-phases.mjs', 'length: 10'],
  ['src/config/phase6RouteMap.ts', '/access/route-contracts'],
  ['src/config/phase6RouteMap.ts', '/patients/check-duplicates'],
  ['src/config/phase6RouteMap.ts', '/doctor/orders'],
  ['src/config/phase6RouteMap.ts', '/reception/walk-ins'],
  ['src/config/phase6RouteMap.ts', '/lab/results'],
  ['src/config/phase6RouteMap.ts', '/scan/results'],
  ['src/config/phase6RouteMap.ts', '/billing/invoices/:id/payments'],
  ['src/config/phase6RouteMap.ts', '/finance/analytics'],
  ['src/config/phase6RouteMap.ts', '/results/delivery-logs'],
  ['src/config/phase6RouteMap.ts', '/notifications/preferences'],
  ['src/config/phase6RouteMap.ts', '/files/dicom/studies'],
  ['src/config/phase6RouteMap.ts', '/reports/dashboard'],
  ['docs/full-system-local-runbook.md', 'VITE_API_MODE=live'],
  ['docs/full-system-local-runbook.md', 'npm run prisma:seed'],
  ['docs/frontend-live-api-integration-contract.md', 'Frontend service boundary'],
  ['docs/backend-business-stage-10-frontend-live-api-final-qa.md', 'Business Logic Stage 10']
];

const failures = [];
for (const file of requiredFiles) {
  if (!existsSync(file)) failures.push(`Missing file: ${file}`);
}
for (const [file, marker] of requiredMarkers) {
  if (!existsSync(file)) {
    failures.push(`Missing marker file: ${file}`);
    continue;
  }
  const content = readFileSync(file, 'utf8');
  if (!content.includes(marker)) failures.push(`Missing marker ${marker} in ${file}`);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const qaScript = packageJson.scripts?.qa || '';
for (let index = 1; index <= 10; index += 1) {
  if (index <= 9) {
    const marker = `check-business-stage${index}.mjs`;
    if (!qaScript.includes(marker)) failures.push(`qa script missing ${marker}`);
  }
}
if (!qaScript.includes('check-business-stage10.mjs')) failures.push('qa script missing check-business-stage10.mjs');

const result = {
  phase: 'Business Logic Stage 10 - Frontend Live API Integration and Final Full-System QA',
  passed: failures.length === 0,
  checkedAt: new Date().toISOString(),
  checks: requiredFiles.length + requiredMarkers.length + 10,
  failures
};

writeFileSync('docs/backend-business-stage-10-qa-results.json', `${JSON.stringify(result, null, 2)}\n`);

if (failures.length) {
  console.error('Backend Business Logic Stage 10 static check failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Backend Business Logic Stage 10 static check passed.');
