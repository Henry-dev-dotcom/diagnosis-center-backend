import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'src/config/permissions.ts',
  'src/config/routeAccess.ts',
  'src/middleware/resourceScope.ts',
  'src/controllers/access.controller.ts',
  'src/controllers/protectedModule.controller.ts',
  'src/routes/access.routes.ts',
  'src/routes/users.routes.ts',
  'src/routes/patients.routes.ts',
  'src/routes/doctors.routes.ts',
  'src/routes/orders.routes.ts',
  'src/routes/reception.routes.ts',
  'src/routes/lab.routes.ts',
  'src/routes/scan.routes.ts',
  'src/routes/billing.routes.ts',
  'src/routes/finance.routes.ts',
  'src/routes/admin.routes.ts',
  'src/routes/results.routes.ts',
  'src/routes/reports.routes.ts',
  'src/routes/notifications.routes.ts',
  'src/routes/files.routes.ts'
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Missing Phase 5 files:', missing.join(', '));
  process.exit(1);
}

const index = fs.readFileSync(path.join(root, 'src/routes/index.ts'), 'utf8');
const routeNames = [
  'accessRoutes',
  'usersRoutes',
  'patientsRoutes',
  'doctorsRoutes',
  'ordersRoutes',
  'receptionRoutes',
  'labRoutes',
  'scanRoutes',
  'billingRoutes',
  'financeRoutes',
  'adminRoutes',
  'resultsRoutes',
  'reportsRoutes',
  'notificationsRoutes',
  'filesRoutes'
];
const missingInIndex = routeNames.filter((route) => !index.includes(route));
if (missingInIndex.length) {
  console.error('Routes not registered in src/routes/index.ts:', missingInIndex.join(', '));
  process.exit(1);
}
if (index.includes('placeholderRoutes')) {
  console.error('placeholderRoutes is still registered; Phase 5 requires protected route groups.');
  process.exit(1);
}

const permissions = fs.readFileSync(path.join(root, 'src/config/permissions.ts'), 'utf8');
const permissionMarkers = [
  'ROLE_PERMISSIONS',
  'PRICE_VISIBLE_ROLES',
  'ORDER_ITEM_TYPE_BY_ROLE',
  'DOCTOR_ORDERS_CREATE',
  'LAB_QUEUE_READ',
  'SCAN_QUEUE_READ',
  'FINANCE_SHIFTS_MANAGE',
  'ADMIN_REFERENCE_RANGES_MANAGE'
];
const missingPermissionMarkers = permissionMarkers.filter((marker) => !permissions.includes(marker));
if (missingPermissionMarkers.length) {
  console.error('Missing permission markers:', missingPermissionMarkers.join(', '));
  process.exit(1);
}

const resourceScope = fs.readFileSync(path.join(root, 'src/middleware/resourceScope.ts'), 'utf8');
for (const marker of ['requireOwnDoctorResource', 'requireOrderItemTypeAccess', 'requireFinanceRole', 'ACCESS_DENIED_SCOPE']) {
  if (!resourceScope.includes(marker)) {
    console.error(`Missing resource scope marker: ${marker}`);
    process.exit(1);
  }
}

const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const duplicateEmailCount = (schema.match(/email\s+String\?\s+@unique/g) ?? []).length;
if (duplicateEmailCount !== 1) {
  console.error(`Expected exactly one User.email field, found ${duplicateEmailCount}.`);
  process.exit(1);
}

console.log('Backend Phase 5 role permissions and protected route structure static check passed.');
