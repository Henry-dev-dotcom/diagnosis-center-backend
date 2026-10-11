/*
  What a deployed instance seeds on boot.

  Always: the subscription plans, and one platform operator whose password comes
  from SEED_ADMIN_PASSWORD. Nothing else — a real deployment starts empty and the
  operator creates each subscribing facility from the platform console.

  Additionally, only when both DEMO_INSTANCE and SEED_DEMO_DATA are "true": the
  DEMO facility, synthetic staff/patient/order data, and synthetic Gustav Biomed
  vendor requests and login. This is for a demonstration instance with its own
  database, never a real facility database.

  Two safeguards on that, because a demonstration instance is on the public
  internet:

    - The demo accounts use short, shared, well-known passwords. That is the
      point of a demo, and it is also why such an instance must never hold real
      patient data. The boot log says so, every time.
    - The demo seed's own platform account (platform/platform123) is deliberately
      NOT created here. The operator account is the strong one from
      SEED_ADMIN_PASSWORD, whatever else is seeded.

  Idempotent: the demo facility is only built if it is not already there, so a
  restart never wipes what someone was in the middle of looking at.
*/
import { PrismaClient } from '@prisma/client';
import { runAsSystem } from '../src/services/tenantContext.js';
import { DEMO_FACILITY, ensureDemoScanFileBytes, seedDemoSubscription, seedFacility, seedPlans } from './seed.js';
import { DEMO_VENDOR_LOGIN, seedDemoVendorPortal } from './seed.vendor-demo.js';

const plain = new PrismaClient();

function wantsDemoData() {
  const enabled = String(process.env.SEED_DEMO_DATA ?? '').trim().toLowerCase() === 'true';
  const dedicatedDemo = String(process.env.DEMO_INSTANCE ?? '').trim().toLowerCase() === 'true';
  if (enabled && !dedicatedDemo) {
    throw new Error('SEED_DEMO_DATA=true requires DEMO_INSTANCE=true and a separate database reserved for synthetic demo data.');
  }
  return enabled;
}

async function main() {
  const demoDataEnabled = wantsDemoData();
  // The platform operator and the plan catalogue, on every deployment.
  await import('./seed.production.js');
  await runAsSystem('seed.plans', () => seedPlans());

  const existing = await plain.facility.findUnique({ where: { code: DEMO_FACILITY.code }, select: { id: true } });

  if (!demoDataEnabled) {
    // The flag decides whether demo data is created, not whether an existing demo
    // is kept working: its image lives on an ephemeral disk and must come back
    // after every redeploy even when the flag is off.
    if (existing) {
      const restored = await ensureDemoScanFileBytes();
      if (restored > 0) console.log('Deploy seed: the demonstration scan image is in place.');
    }
    console.log('Deploy seed: plans and the platform operator. No demo data created (set SEED_DEMO_DATA=true for a demonstration instance).');
    return;
  }

  if (existing) {
    /*
      Clinical demo data is left intact. Synthetic vendor fixtures are ensured,
      and the demonstration study's bytes are restored even though nothing else is.

      A deployment's disk is ephemeral: the row saying an ultrasound is attached
      survives a redeploy and the file behind it does not, so without this the
      viewer would quietly go back to reporting the study as metadata-only a few
      hours after anyone last looked at it.
    */
    await seedDemoVendorPortal(plain);
    console.log(`Vendor demo login: ${DEMO_VENDOR_LOGIN.email} / ${DEMO_VENDOR_LOGIN.password}`);
    const restored = await ensureDemoScanFileBytes();
    console.log(`Deploy seed: the ${DEMO_FACILITY.code} facility's clinical data was not reset; demo vendor fixtures were ensured.`);
    if (restored > 0) console.log('Deploy seed: the demonstration scan image is in place.');
    return;
  }

  await seedFacility(DEMO_FACILITY);
  await seedDemoSubscription(DEMO_FACILITY.id);
  await seedDemoVendorPortal(plain);

  console.log('');
  console.log('='.repeat(78));
  console.log(`Deploy seed: created the demonstration facility ${DEMO_FACILITY.name} (code ${DEMO_FACILITY.code}).`);
  console.log('Sign in with facility code DEMO and any of:');
  console.log('  admin/admin123  doctor/doctor123  nurse/nurse123  pharmacist/pharmacist123');
  console.log('  reception/reception123  lab/lab123  scan/scan123  billing/billing123');
  console.log(`Vendor demo login: ${DEMO_VENDOR_LOGIN.email} / ${DEMO_VENDOR_LOGIN.password}`);
  console.log('');
  console.log('These passwords are short and shared on purpose, so people can explore.');
  console.log('THIS INSTANCE MUST NOT HOLD REAL PATIENT DATA. Turn SEED_DEMO_DATA off and');
  console.log('use a separate deployment before any real facility goes on it.');
  console.log('='.repeat(78));
  console.log('');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await plain.$disconnect();
  });
