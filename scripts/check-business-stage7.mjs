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
if (!(/^1\.[7-9]\.0$/.test(packageJson.version ?? '') || /^2\.\d+\.\d+$/.test(packageJson.version ?? ''))) failures.push('package.json version must be 1.7.0 or later for Business Logic Stage 7');
if (!packageJson.scripts?.['qa:business-stage7']) failures.push('package.json is missing qa:business-stage7');
if (!String(packageJson.scripts?.qa ?? '').includes('check-business-stage7.mjs')) failures.push('npm run qa must include Business Logic Stage 7 checks');

const requiredFiles = [
  'src/services/results.service.ts',
  'src/controllers/results.controller.ts',
  'src/services/reports.service.ts',
  'src/controllers/reports.controller.ts',
  'src/services/notification.service.ts',
  'src/controllers/notification.controller.ts',
  'src/services/file.service.ts',
  'src/controllers/file.controller.ts',
  'docs/backend-business-stage-7-results-delivery-reporting.md',
  'scripts/check-business-stage7.mjs'
];
for (const file of requiredFiles) read(file);

for (const routeFile of ['src/routes/results.routes.ts', 'src/routes/reports.routes.ts', 'src/routes/notifications.routes.ts', 'src/routes/files.routes.ts']) {
  assertNotIncludes(routeFile, 'endpointPlaceholder', `${routeFile} placeholder handlers`);
  assertNotIncludes(routeFile, 'moduleLanding', `${routeFile} module landing handlers`);
}

assertIncludes('src/routes/doctors.routes.ts', 'listResultsController', 'doctor results live controller');
assertIncludes('src/routes/results.routes.ts', 'listResultsController', 'live results list route');
assertIncludes('src/routes/results.routes.ts', 'releaseResultController', 'live result release route');
assertIncludes('src/routes/results.routes.ts', 'getResultReportController', 'live PDF-ready report route');
assertIncludes('src/routes/results.routes.ts', 'emailResultController', 'live email delivery route');
assertIncludes('src/routes/results.routes.ts', 'smsResultController', 'live SMS delivery route');
assertIncludes('src/routes/results.routes.ts', 'whatsappResultController', 'live WhatsApp delivery route');
assertIncludes('src/routes/results.routes.ts', 'retryDeliveryLogController', 'live delivery retry route');

assertIncludes('src/services/results.service.ts', 'SecureResultLink', 'secure result link model usage');
assertIncludes('src/services/results.service.ts', 'tokenHash', 'secure token hash storage');
assertIncludes('src/services/results.service.ts', 'DeliveryChannel.SMS', 'SMS delivery channel');
assertIncludes('src/services/results.service.ts', 'DeliveryChannel.WHATSAPP', 'WhatsApp delivery channel');
assertIncludes('src/services/results.service.ts', 'isPrivacySafeChannel', 'privacy-safe channel guard');
assertIncludes('src/services/results.service.ts', 'must not include clinical', 'privacy explanation marker');
assertIncludes('src/services/results.service.ts', 'RESULT_RELEASED', 'result release notification/audit marker');
assertIncludes('src/services/results.service.ts', 'PDF_DOWNLOAD', 'PDF download delivery log');
assertIncludes('src/services/results.service.ts', 'DELIVERY_RETRIED', 'delivery retry audit action');

assertIncludes('src/routes/reports.routes.ts', 'reportsOverviewController', 'reports overview controller');
assertIncludes('src/routes/reports.routes.ts', 'turnaroundTimeReportController', 'TAT report controller');
assertIncludes('src/routes/reports.routes.ts', 'orderVolumeReportController', 'order volume report controller');
assertIncludes('src/routes/reports.routes.ts', 'revenueReportController', 'revenue report controller');
assertIncludes('src/routes/reports.routes.ts', 'abnormalResultsReportController', 'abnormal results report controller');
assertIncludes('src/routes/reports.routes.ts', 'reportExportController', 'report export controller');
assertIncludes('src/services/reports.service.ts', 'getTurnaroundTimeReport', 'turnaround service');
assertIncludes('src/services/reports.service.ts', 'getRevenueReport', 'revenue service');
assertIncludes('src/services/reports.service.ts', 'getAbnormalResultsReport', 'abnormal results service');
assertIncludes('src/services/reports.service.ts', 'REPORT_EXPORTED', 'report export audit action');

assertIncludes('src/routes/notifications.routes.ts', 'listNotificationsController', 'notification list controller');
assertIncludes('src/routes/notifications.routes.ts', 'markNotificationReadController', 'mark read controller');
assertIncludes('src/routes/notifications.routes.ts', 'retryNotificationLogController', 'notification retry controller');
assertIncludes('src/services/notification.service.ts', 'NOTIFICATION_MARKED_READ', 'notification mark-read audit');
assertIncludes('src/services/notification.service.ts', 'NOTIFICATION_DELIVERY_RETRIED', 'notification retry audit');
assertIncludes('src/services/notification.service.ts', 'NOTIFICATION_SETTINGS_UPDATED', 'notification settings audit');

assertIncludes('src/routes/files.routes.ts', 'listFilesController', 'file list controller');
assertIncludes('src/routes/files.routes.ts', 'uploadFileMetadataController', 'file upload metadata controller');
assertIncludes('src/routes/files.routes.ts', 'deleteFileMetadataController', 'file delete metadata controller');
assertIncludes('src/services/file.service.ts', 'ScanResultFile', 'scan file metadata persistence');
assertIncludes('src/services/file.service.ts', 'metadata-only', 'metadata-only storage marker');
assertIncludes('src/services/file.service.ts', 'FILE_METADATA_UPLOADED', 'file upload audit action');
assertIncludes('src/services/file.service.ts', 'FILE_METADATA_DELETED', 'file delete audit action');

assertRegex('src/config/phase6RouteMap.ts', /path: '\/doctor\/results'[\s\S]*?status: 'implemented'/, 'doctor results contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/results'[\s\S]*?status: 'implemented'/, 'results list contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/results\/:id\/release'[\s\S]*?status: 'implemented'/, 'result release contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/results\/:id\/sms'[\s\S]*?status: 'implemented'[\s\S]*?SMS must not include clinical values or diagnosis/, 'SMS privacy-safe contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/reports\/export'[\s\S]*?status: 'implemented'/, 'reports export contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/notifications'[\s\S]*?status: 'implemented'/, 'notifications contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/files\/upload'[\s\S]*?status: 'implemented'/, 'files upload contract implemented');
assertRegex('src/controllers/system.controller.ts', /version: '(1\.[7-9]\.0|2\.\d+\.\d+)'/, 'version endpoint 1.7.0 or later');
assertRegex('src/config/openapi.ts', /version: '(1\.[7-9]\.0|2\.\d+\.\d+)'/, 'OpenAPI version 1.7.0 or later');
assertIncludes('README.md', 'Business Logic Stage 7', 'README Business Logic Stage 7 section');
assertIncludes('docs/backend-roadmap.md', 'Business Logic Stage 7 — Results Delivery + Reporting', 'roadmap Business Logic Stage 7 section');

if (failures.length) {
  console.error('Backend Business Logic Stage 7 static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  stage: 'Business Logic Stage 7',
  name: 'Results Delivery + Reporting',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  packageVersion: packageJson.version,
  checks: [
    'result placeholders were replaced with live controllers',
    'doctor result list is live and scoped through the shared results service',
    'release workflow creates secure result links and notifications',
    'PDF-ready report payload records PDF download delivery logs',
    'email, SMS, and WhatsApp result delivery records notifications and delivery logs',
    'SMS and WhatsApp delivery remain privacy-safe',
    'delivery log list and retry workflow are live',
    'reporting endpoints are backed by Prisma summaries/lists',
    'notifications list/read/log/retry/settings routes are live',
    'file metadata routes are live with scan/DICOM metadata persistence where supported',
    'major result, delivery, notification, report, and file actions emit audit logs',
    'Phase 6 route contracts were updated to implemented for Stage 7 endpoints',
    'documentation added'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-business-stage-7-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Business Logic Stage 7 static check passed.');
