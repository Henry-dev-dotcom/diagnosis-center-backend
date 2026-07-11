/*
  Production seed: the minimum reference data a fresh deployment needs to be
  usable — one administrator account plus departments, equipment and the
  test/scan catalog with reference ranges. It creates NO demo patients,
  orders, invoices or extra staff; the administrator provisions real staff
  accounts and patients through the app.

  Idempotent: if an admin user already exists the seed exits without touching
  data, so it is safe to run on every deploy.
*/
import { UserRole } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';
import {
  prisma,
  seedDepartmentsAndEquipment,
  seedCatalogAndReferenceRanges
} from './seed.js';

async function main() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
  if (existingAdmin) {
    console.log(`Production seed skipped — an administrator (${existingAdmin.username}) already exists.`);
    return;
  }

  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@diagnosis-center.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error('Set SEED_ADMIN_PASSWORD (min 8 chars) before running the production seed.');
  }

  await prisma.user.create({
    data: {
      username: adminUsername,
      name: 'System Administrator',
      email: adminEmail,
      role: UserRole.ADMIN,
      passwordHash: await hashPassword(adminPassword)
    }
  });

  await seedDepartmentsAndEquipment();
  await seedCatalogAndReferenceRanges();

  console.log('Production seed complete.');
  console.log(`Administrator login: ${adminUsername} (change the password after first sign-in).`);
  console.log('Departments, equipment and the test/scan catalog are loaded. Create staff and patients through the app.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
