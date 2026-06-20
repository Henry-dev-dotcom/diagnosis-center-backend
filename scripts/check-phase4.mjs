import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'src/routes/auth.routes.ts',
  'src/controllers/auth.controller.ts',
  'src/services/auth.service.ts',
  'src/services/permission.service.ts',
  'src/services/audit.service.ts',
  'src/middleware/auth.ts',
  'src/validators/auth.validators.ts',
  'src/utils/password.ts',
  'src/utils/token.ts',
  'src/types/auth.ts',
  'docs/backend-phase-4-authentication-system.md'
];

const requiredPackageDeps = ['bcryptjs', 'jsonwebtoken'];
const requiredDevDeps = ['@types/jsonwebtoken'];

const requiredSnippets = [
  ['src/routes/index.ts', 'apiRouter.use(authRoutes)'],
  ['src/routes/auth.routes.ts', "post('/auth/login'"],
  ['src/routes/auth.routes.ts', "post('/auth/refresh'"],
  ['src/routes/auth.routes.ts', "post('/auth/logout'"],
  ['src/routes/auth.routes.ts', "get('/auth/me'"],
  ['src/routes/auth.routes.ts', "patch('/auth/change-password'"],
  ['src/middleware/auth.ts', 'requireAuth'],
  ['src/middleware/auth.ts', 'requireRole'],
  ['src/middleware/auth.ts', 'requirePermission'],
  ['src/services/auth.service.ts', 'loginWithPassword'],
  ['src/services/auth.service.ts', 'refreshTokenPair'],
  ['src/services/auth.service.ts', 'logoutSession'],
  ['src/services/auth.service.ts', 'changePassword'],
  ['src/services/permission.service.ts', 'doctor:orders:create'],
  ['src/services/permission.service.ts', 'finance:shifts:manage'],
  ['prisma/seed.ts', 'admin123'],
  ['prisma/seed.ts', 'doctor123'],
  ['prisma/seed.ts', 'hashPassword']
];

const missing = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) missing.push(file);
}

for (const [file, snippet] of requiredSnippets) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath) || !fs.readFileSync(filePath, 'utf8').includes(snippet)) {
    missing.push(`${file} :: ${snippet}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const dep of requiredPackageDeps) {
  if (!pkg.dependencies?.[dep]) missing.push(`package dependency: ${dep}`);
}
for (const dep of requiredDevDeps) {
  if (!pkg.devDependencies?.[dep]) missing.push(`package devDependency: ${dep}`);
}

if (missing.length) {
  console.error('Backend Phase 4 static check failed. Missing:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log('Backend Phase 4 authentication system static check passed.');
