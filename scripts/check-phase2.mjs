import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/services/prisma.service.ts',
  'src/services/database.service.ts',
  'src/controllers/system.controller.ts',
  'src/routes/system.routes.ts',
  'prisma/schema.prisma',
  'prisma/seed.ts',
  'docker-compose.yml',
  '.env.example',
  'docs/backend-phase-2-postgresql-prisma.md'
];

const requiredSchemaMarkers = [
  'model User',
  'model Hospital',
  'model DoctorProfile',
  'model Patient',
  'model Department',
  'model Equipment',
  'model CatalogItem',
  'model ReferenceParameter',
  'model ReferenceRange',
  'model AuditLog',
  'enum UserRole',
  'enum CatalogItemType'
];

const requiredSourceMarkers = [
  'checkDatabaseConnection',
  'getDatabaseSummary',
  '/database/status',
  'Backend Phase 2'
];

const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missingFiles.length) {
  console.error('Missing required files:', missingFiles);
  process.exit(1);
}

const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const missingSchemaMarkers = requiredSchemaMarkers.filter((marker) => !schema.includes(marker));
if (missingSchemaMarkers.length) {
  console.error('Missing schema markers:', missingSchemaMarkers);
  process.exit(1);
}

const combinedSource = [
  'src/services/prisma.service.ts',
  'src/services/database.service.ts',
  'src/controllers/system.controller.ts',
  'src/routes/system.routes.ts',
  'prisma/seed.ts'
]
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n');

const missingSourceMarkers = requiredSourceMarkers.filter((marker) => !combinedSource.includes(marker));
if (missingSourceMarkers.length) {
  console.error('Missing source markers:', missingSourceMarkers);
  process.exit(1);
}

console.log('Backend Phase 2 static structure check passed.');
