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
if (!['0.8.0', '0.9.0', '1.0.0'].includes(packageJson.version) && !/^([12])\./.test(packageJson.version ?? '')) failures.push('package.json version must be 0.8.0 or later Phase 8-compatible foundation/business version');
if (!packageJson.scripts?.qa?.includes('check-phase')) failures.push('package.json qa script must run a current Phase 8 or later QA script');

assertIncludes('prisma/schema.prisma', 'model AuditLog', 'AuditLog model');
assertIncludes('prisma/schema.prisma', 'model SystemEvent', 'SystemEvent model');
assertIncludes('prisma/schema.prisma', 'model ApiRequestLog', 'ApiRequestLog model');
assertIncludes('prisma/schema.prisma', 'beforeData Json?', 'AuditLog beforeData snapshot');
assertIncludes('prisma/schema.prisma', 'afterData  Json?', 'AuditLog afterData snapshot');

assertIncludes('src/services/audit.service.ts', 'createAuditLog', 'createAuditLog service');
assertIncludes('src/services/audit.service.ts', 'createSystemEvent', 'createSystemEvent service');
assertIncludes('src/services/audit.service.ts', 'createApiRequestLog', 'createApiRequestLog service');
assertIncludes('src/services/audit.service.ts', 'getRequestAuditContext', 'request audit context helper');
assertIncludes('src/services/audit.service.ts', 'auditSuccessfulRequest', 'successful request audit helper');
assertIncludes('src/services/audit.service.ts', 'beforeData', 'beforeData support');
assertIncludes('src/services/audit.service.ts', 'afterData', 'afterData support');
assertIncludes('src/services/audit.service.ts', 'ipAddress', 'IP address support');
assertIncludes('src/services/audit.service.ts', 'userAgent', 'user agent support');

assertIncludes('src/middleware/audit.ts', 'apiRequestLogger', 'api request logger middleware');
assertIncludes('src/middleware/audit.ts', 'auditAccessFailure', 'access failure audit helper');
assertIncludes('src/middleware/audit.ts', 'createSystemEvent', 'system event logging');
assertIncludes('src/app.ts', 'apiRequestLogger', 'API request logger registered');

assertIncludes('src/controllers/audit.controller.ts', 'listAuditLogs', 'audit log controller');
assertIncludes('src/controllers/audit.controller.ts', 'listSystemEvents', 'system events controller');
assertIncludes('src/controllers/audit.controller.ts', 'listApiRequestLogs', 'API request logs controller');
assertIncludes('src/controllers/audit.controller.ts', 'AUDIT_LOGS_VIEWED', 'audit read event');

assertIncludes('src/validators/audit.validators.ts', 'auditLogQuerySchema', 'audit log query validator');
assertIncludes('src/validators/audit.validators.ts', 'systemEventQuerySchema', 'system event query validator');
assertIncludes('src/validators/audit.validators.ts', 'apiRequestLogQuerySchema', 'API request log query validator');

assertIncludes('src/routes/admin.routes.ts', "/admin/audit-logs", 'admin audit logs route');
assertIncludes('src/routes/admin.routes.ts', "/admin/system-events", 'admin system events route');
assertIncludes('src/routes/admin.routes.ts', "/admin/api-request-logs", 'admin API request logs route');
assertIncludes('src/routes/admin.routes.ts', 'PERMISSIONS.ADMIN_AUDIT_READ', 'admin audit permission protection');

assertIncludes('src/middleware/auth.ts', 'AUTH_TOKEN_REQUIRED', 'missing token audit path');
assertIncludes('src/middleware/auth.ts', 'ACCESS_DENIED_ROLE', 'role denial audit');
assertIncludes('src/middleware/auth.ts', 'ACCESS_DENIED_PERMISSION', 'permission denial audit');
assertIncludes('src/middleware/errorHandler.ts', 'ROUTE_NOT_FOUND', 'unknown route audit path');
assertIncludes('src/controllers/protectedModule.controller.ts', 'auditSuccessfulRequest', 'protected action auditing');
assertIncludes('src/services/auth.service.ts', 'AUTH_LOGIN_SUCCESS', 'login success audit');
assertIncludes('src/services/auth.service.ts', 'AUTH_LOGIN_FAILED', 'login failure audit');
assertIncludes('src/services/auth.service.ts', 'AUTH_LOGOUT', 'logout audit');
assertIncludes('src/services/auth.service.ts', 'AUTH_PASSWORD_CHANGED', 'password change audit');
assertIncludes('src/services/auth.service.ts', 'AUTH_TOKEN_REFRESHED', 'token refresh audit');

assertIncludes('src/config/phase6RouteMap.ts', "/admin/system-events", 'system events route contract');
assertIncludes('src/config/phase6RouteMap.ts', "/admin/api-request-logs", 'API request logs route contract');
assertRegex('src/config/openapi.ts', /version: '(0\.[89]\.0|[12]\.\d+\.\d+)'/, 'OpenAPI version 0.8.0 or later foundation/business version');
assertIncludes('docs/backend-phase-8-audit-logging-foundation.md', 'Backend Phase 8', 'Phase 8 documentation');

if (failures.length) {
  console.error('Backend Phase 8 audit logging foundation static check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const result = {
  phase: 8,
  name: 'Audit Logging Foundation',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  checks: [
    'audit service',
    'system event service',
    'api request log service',
    'api request logging middleware',
    'access failure logging',
    'admin audit endpoints',
    'audit validators',
    'route contracts',
    'OpenAPI version',
    'package QA script'
  ]
};

fs.writeFileSync(path.join(root, 'docs/backend-phase-8-qa-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log('Backend Phase 8 audit logging foundation static check passed.');
