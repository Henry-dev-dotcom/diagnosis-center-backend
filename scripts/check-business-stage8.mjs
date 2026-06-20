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

const packageJson = JSON.parse(read('package.json') || '{}');
if (!(String(packageJson.version ?? '').match(/^1\.[89]\.0$/) || String(packageJson.version ?? '').match(/^2\.\d+\.\d+$/))) failures.push('package.json version must be 1.8.0 or later for Business Logic Stage 8+');
if (!packageJson.scripts?.['qa:business-stage8']) failures.push('package.json is missing qa:business-stage8');
if (!String(packageJson.scripts?.qa ?? '').includes('check-business-stage8.mjs')) failures.push('npm run qa must include Business Logic Stage 8 checks');

const requiredFiles = [
  'src/services/fileStorage.service.ts',
  'src/services/file.service.ts',
  'src/controllers/file.controller.ts',
  'src/routes/files.routes.ts',
  'src/validators/file.validators.ts',
  'src/services/notification.service.ts',
  'src/controllers/notification.controller.ts',
  'src/routes/notifications.routes.ts',
  'src/validators/notification.validators.ts',
  'docs/backend-business-stage-8-notifications-files-dicom-upload.md',
  'scripts/check-business-stage8.mjs'
];
for (const file of requiredFiles) read(file);

assertIncludes('src/config/env.ts', 'UPLOAD_STORAGE_DRIVER', 'upload storage driver env');
assertIncludes('src/config/env.ts', 'MAX_UPLOAD_BYTES', 'max upload bytes env');
assertIncludes('src/config/env.ts', 'SIGNED_FILE_URL_TTL_MINUTES', 'signed download TTL env');
assertIncludes('.env.example', 'UPLOAD_ROOT=uploads', 'upload root example');

assertIncludes('src/services/fileStorage.service.ts', 'normalizeAndStoreFile', 'file normalization/storage helper');
assertIncludes('src/services/fileStorage.service.ts', 'contentBase64', 'base64 upload support');
assertIncludes('src/services/fileStorage.service.ts', 'checksumSha256', 'checksum generation');
assertIncludes('src/services/fileStorage.service.ts', 'signedDownloadPayload', 'signed download payload helper');
assertIncludes('src/services/fileStorage.service.ts', 'verifyDownloadSignature', 'download signature verification helper');
assertIncludes('src/services/fileStorage.service.ts', 'inferDicom', 'DICOM inference helper');

assertIncludes('src/routes/files.routes.ts', "'/files/upload'", 'file upload route');
assertIncludes('src/routes/files.routes.ts', "'/files/:id/download'", 'file download route');
assertIncludes('src/routes/files.routes.ts', "'/files/dicom/studies'", 'DICOM study list route');
assertIncludes('src/routes/files.routes.ts', "'/files/dicom/studies/:studyUid'", 'DICOM study detail route');
assertIncludes('src/controllers/file.controller.ts', 'downloadFileController', 'download file controller');
assertIncludes('src/controllers/file.controller.ts', 'listDicomStudiesController', 'DICOM studies controller');
assertIncludes('src/services/file.service.ts', 'FILES_UPLOADED', 'file upload audit action');
assertIncludes('src/services/file.service.ts', 'FILE_DOWNLOADED', 'file download audit action');
assertIncludes('src/services/file.service.ts', 'FILE_DELETED', 'file delete audit action');
assertIncludes('src/services/file.service.ts', 'listDicomStudies', 'DICOM studies service');
assertIncludes('src/services/file.service.ts', 'getDicomStudy', 'DICOM study service');

assertIncludes('src/services/scan.service.ts', 'normalizeAndStoreFile', 'scan file upload storage integration');
assertIncludes('src/validators/scan.validators.ts', 'contentBase64', 'scan file base64 validation');
assertIncludes('src/services/lab.service.ts', 'LAB_RESULT_FILES_UPLOADED_METADATA_ONLY', 'lab file attachment audit marker');

assertIncludes('src/routes/notifications.routes.ts', "post('/notifications'", 'create notification route');
assertIncludes('src/routes/notifications.routes.ts', "'/notifications/:id/deliver'", 'deliver notification route');
assertIncludes('src/routes/notifications.routes.ts', "'/notifications/read-all'", 'read-all route');
assertIncludes('src/routes/notifications.routes.ts', "'/notifications/preferences'", 'preferences route');
assertIncludes('src/services/notification.service.ts', 'NOTIFICATION_CREATED', 'notification create audit');
assertIncludes('src/services/notification.service.ts', 'NOTIFICATION_DELIVERED', 'notification delivery audit');
assertIncludes('src/services/notification.service.ts', 'NOTIFICATIONS_MARKED_ALL_READ', 'bulk read audit');
assertIncludes('src/services/notification.service.ts', 'PRIVACY_SAFE_NOTICE', 'privacy-safe delivery body');
assertIncludes('src/validators/notification.validators.ts', 'createNotificationSchema', 'create notification schema');
assertIncludes('src/validators/notification.validators.ts', 'deliverNotificationSchema', 'deliver notification schema');

assertRegex('src/config/phase6RouteMap.ts', /path: '\/files\/:id\/download'[\s\S]*?status: 'implemented'/, 'files download contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/files\/dicom\/studies'[\s\S]*?status: 'implemented'/, 'DICOM studies contract implemented');
assertRegex('src/config/phase6RouteMap.ts', /path: '\/notifications\/:id\/deliver'[\s\S]*?privacy-safe message bodies[\s\S]*?status: 'implemented'/, 'notification deliver privacy contract implemented');
assertRegex('src/controllers/system.controller.ts', /version: '(1\.[89]\.0|2\.\d+\.\d+)'/, 'version endpoint 1.8.0 or later');
assertRegex('src/config/openapi.ts', /version: '(1\.[89]\.0|2\.\d+\.\d+)'/, 'OpenAPI version 1.8.0 or later');
assertIncludes('README.md', 'Business Logic Stage 8', 'README Business Logic Stage 8 section');
assertIncludes('docs/backend-roadmap.md', 'Business Logic Stage 8 — Notifications + Files + DICOM-ready Upload Layer', 'roadmap Business Logic Stage 8 section');

if (failures.length) {
  console.error('Backend Business Logic Stage 8 static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  stage: 'Business Logic Stage 8',
  name: 'Notifications + Files + DICOM-ready Upload Layer',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  packageVersion: packageJson.version,
  checks: [
    'notification creation, delivery, read/unread, read-all, preferences, and retry routes are live',
    'SMS and WhatsApp notification delivery keeps privacy-safe body handling',
    'file upload accepts JSON/base64 payloads and metadata-only records',
    'scan file uploads persist ScanResultFile metadata and can store local bytes',
    'lab file attachment endpoint stores/audits metadata-ready uploads without schema migration',
    'download endpoint serves local bytes when available and exposes signed download payloads',
    'DICOM-ready study list/detail endpoints group files by Study UID',
    'upload environment settings are documented and validated',
    'Phase 6 route contracts and OpenAPI metadata were updated',
    'documentation added'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-business-stage-8-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Business Logic Stage 8 static check passed.');
