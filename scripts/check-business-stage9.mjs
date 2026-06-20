import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const requiredFiles = [
  'src/services/analytics.service.ts',
  'src/controllers/analytics.controller.ts',
  'docs/backend-business-stage-9-reports-analytics-audit-admin-exports.md'
];

const requiredMarkers = [
  ['src/services/analytics.service.ts', 'getExecutiveDashboard'],
  ['src/services/analytics.service.ts', 'getFinanceDashboard'],
  ['src/services/analytics.service.ts', 'getLabDashboard'],
  ['src/services/analytics.service.ts', 'getScanDashboard'],
  ['src/services/analytics.service.ts', 'getReceptionDashboard'],
  ['src/services/analytics.service.ts', 'getAuditReviewDashboard'],
  ['src/services/analytics.service.ts', 'exportAuditReview'],
  ['src/services/analytics.service.ts', 'exportAdminFullBundle'],
  ['src/controllers/analytics.controller.ts', 'executiveDashboardController'],
  ['src/controllers/analytics.controller.ts', 'auditReviewExportController'],
  ['src/routes/reports.routes.ts', '/reports/dashboard'],
  ['src/routes/reports.routes.ts', '/reports/analytics/finance'],
  ['src/routes/reports.routes.ts', '/reports/analytics/lab'],
  ['src/routes/reports.routes.ts', '/reports/analytics/scan'],
  ['src/routes/reports.routes.ts', '/reports/analytics/reception'],
  ['src/routes/reports.routes.ts', '/reports/analytics/audit'],
  ['src/routes/admin.routes.ts', '/admin/audit-summary'],
  ['src/routes/admin.routes.ts', '/admin/audit-export'],
  ['src/routes/admin.routes.ts', '/admin/full-export'],
  ['src/config/phase6RouteMap.ts', '/reports/dashboard'],
  ['src/config/phase6RouteMap.ts', '/admin/full-export'],
  ['package.json', 'qa:business-stage9']
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

const result = {
  phase: 'Business Logic Stage 9 - Reports, Analytics, Audit Review, Admin Exports',
  passed: failures.length === 0,
  checkedAt: new Date().toISOString(),
  checks: requiredMarkers.length + requiredFiles.length,
  failures
};

writeFileSync('docs/backend-business-stage-9-qa-results.json', `${JSON.stringify(result, null, 2)}\n`);

if (failures.length) {
  console.error('Backend Business Logic Stage 9 static check failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Backend Business Logic Stage 9 static check passed.');
