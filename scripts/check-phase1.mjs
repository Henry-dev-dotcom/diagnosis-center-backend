import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'package.json',
  'tsconfig.json',
  '.env.example',
  'docker-compose.yml',
  'src/app.ts',
  'src/server.ts',
  'src/config/env.ts',
  'src/config/openapi.ts',
  'src/middleware/errorHandler.ts',
  'src/middleware/security.ts',
  'src/routes/index.ts',
  'src/routes/system.routes.ts',
  'src/controllers/system.controller.ts',
  'prisma/schema.prisma',
  'prisma/seed.ts',
  'README.md'
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));

if (missing.length) {
  console.error('Phase 1 check failed. Missing files:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const requiredScripts = ['dev', 'build', 'qa', 'prisma:migrate', 'prisma:seed'];
const missingScripts = requiredScripts.filter((script) => !packageJson.scripts?.[script]);

if (missingScripts.length) {
  console.error('Phase 1 check failed. Missing package scripts:');
  for (const script of missingScripts) console.error(`- ${script}`);
  process.exit(1);
}

console.log('Phase 1 static structure check passed.');
