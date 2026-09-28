/*
  Production seed: creates the platform operator account and nothing else. The
  operator signs in without a facility code and creates each subscribing
  facility (with its first administrator) from the platform console; facility
  administrators then add their own staff, departments, catalog and patients.

  Idempotent: if a platform administrator already exists the seed exits without
  touching data, so it is safe to run on every deploy.
*/
import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';

// Only facility-less platform users are touched here, so the tenant extension
// is not needed; a plain client keeps this script independent of app config.
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findFirst({ where: { role: UserRole.PLATFORM_ADMIN, facilityId: null } });
  if (existing) {
    console.log(`Production seed skipped — a platform administrator (${existing.username}) already exists.`);
    return;
  }

  const username = (process.env.SEED_ADMIN_USERNAME || 'platform').trim().toLowerCase();
  const email = process.env.SEED_ADMIN_EMAIL || null;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Set SEED_ADMIN_PASSWORD (min 12 chars) before running the production seed.');
  }

  await prisma.user.create({
    data: {
      username,
      name: 'Platform Administrator',
      email,
      role: UserRole.PLATFORM_ADMIN,
      facilityId: null,
      passwordHash: await hashPassword(password)
    }
  });

  console.log('Production seed complete.');
  console.log(`Platform administrator: ${username}. Sign in with no facility code and change the password.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
