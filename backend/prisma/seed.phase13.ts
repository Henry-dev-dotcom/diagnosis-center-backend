import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sqlPath = join(__dirname, 'seeds', 'phase13_multi_facility_demo.seed.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  // Use the SQL seed because the live backend may have legacy Prisma model names
  // while the new phase models are additive. The SQL is idempotent and defensive.
  await prisma.$executeRawUnsafe(sql);

  console.log('Phase 13 multi-facility demo seed completed.');
}

main()
  .catch((error) => {
    console.error('Phase 13 seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
