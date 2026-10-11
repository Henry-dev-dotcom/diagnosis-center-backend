import { GustavBiomedRequestType, GustavRequestStatus, GustavSupplyCategory, UserStatus, type PrismaClient } from '@prisma/client';
import { runAsSystem, runWithFacility } from '../src/services/tenantContext.js';
import { hashPassword } from '../src/utils/password.js';
import { DEMO_FACILITY, prisma as seedPrisma } from './seed.js';

const DEMO_PARTNER_ID = 'gustav-biomed-limited';
const DEMO_PARTNER_CODE = 'GUSTAV_BIOMED';

export const DEMO_VENDOR_LOGIN = {
  fullName: 'Gustav Biomed Demo User',
  email: 'vendor-demo@curatamed.test',
  password: 'DemoVendor2026!'
} as const;

/**
 * Creates synthetic-only partner requests and a shared demo login.
 * Call only from a dedicated demo database after both demo flags are enabled.
 */
export async function seedDemoVendorPortal(db: PrismaClient) {
  const passwordHash = await hashPassword(DEMO_VENDOR_LOGIN.password);
  const partner = await runAsSystem('seed.demo-vendor-partner', () => db.vendorPartner.upsert({
    where: { id: DEMO_PARTNER_ID },
    create: {
      id: DEMO_PARTNER_ID,
      code: DEMO_PARTNER_CODE,
      name: 'Gustav Biomed Limited — Demo',
      contactPhone: '+233 59 536 5391',
      isActive: true
    },
    update: {
      code: DEMO_PARTNER_CODE,
      name: 'Gustav Biomed Limited — Demo',
      contactPhone: '+233 59 536 5391',
      isActive: true
    }
  }));

  await runAsSystem('seed.demo-vendor-user', async () => {
    const existing = await db.vendorPortalUser.findUnique({
      where: { partnerId_email: { partnerId: partner.id, email: DEMO_VENDOR_LOGIN.email } },
      select: { id: true }
    });
    if (!existing) {
      await db.vendorPortalUser.create({
        data: {
          id: 'demo-gustav-vendor-head',
          partnerId: partner.id,
          fullName: DEMO_VENDOR_LOGIN.fullName,
          email: DEMO_VENDOR_LOGIN.email,
          passwordHash,
          status: UserStatus.ACTIVE
        }
      });
    }
  });

  const demoRequests = [
    {
      requestCode: 'GB-DEMO-0001',
      supplierPartnerId: partner.id,
      supplierName: 'Gustav Biomed Limited (Demo)',
      type: GustavBiomedRequestType.SUPPLY,
      status: GustavRequestStatus.PENDING,
      requestingUnit: 'Stores Department',
      supplyCategory: GustavSupplyCategory.REAGENTS,
      itemDescription: 'Glucose reagent kits (synthetic demo request)',
      quantity: 6,
      quantityUnit: 'kits',
      notes: 'Synthetic demo record only. No patient information.'
    },
    {
      requestCode: 'GB-DEMO-0002',
      supplierPartnerId: partner.id,
      supplierName: 'Gustav Biomed Limited (Demo)',
      type: GustavBiomedRequestType.ANALYZER_MAINTENANCE,
      status: GustavRequestStatus.ACKNOWLEDGED,
      requestingUnit: 'Laboratory',
      analyzerName: 'Demo chemistry analyzer',
      serviceDescription: 'Routine preventive maintenance — synthetic demo data only.',
      preferredServiceDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notes: 'Synthetic demo record only. No patient information.'
    }
  ];

  await runWithFacility(DEMO_FACILITY.id, async () => {
    for (const request of demoRequests) {
      await seedPrisma.gustavBiomedRequest.upsert({
        where: { facilityId_requestCode: { facilityId: DEMO_FACILITY.id, requestCode: request.requestCode } },
        update: {},
        create: request
      });
    }
  });
}
