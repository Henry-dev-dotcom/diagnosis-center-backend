import { prisma, seedFacility, seedDemoPlatformAdmin, DEMO_FACILITY } from '../../prisma/seed.js';
import { runAsSystem } from '../../src/services/tenantContext.js';
import { FACILITY_A, FACILITY_B } from './fixtures.js';

async function main() {
  await seedFacility({ ...DEMO_FACILITY, ...FACILITY_A });
  await seedFacility(FACILITY_B);
  await runAsSystem('test.seed', () => seedDemoPlatformAdmin());
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
