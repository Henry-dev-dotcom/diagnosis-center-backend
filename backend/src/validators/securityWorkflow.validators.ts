import { z } from 'zod';

const uuidOrId = z.string().trim().min(1);

export const selectedLabTestSchema = z.object({
  orderItemId: z.string().trim().optional().nullable(),
  testId: z.string().trim().optional().nullable(),
  testCode: z.string().trim().optional().nullable(),
  testName: z.string().trim().optional().nullable(),
  referenceRange: z.string().trim().optional().nullable(),
  unit: z.string().trim().optional().nullable(),
}).refine(
  (value) => Boolean(value.orderItemId || value.testId || value.testCode || value.testName),
  'Each selected test must include orderItemId, testId, testCode, or testName.'
);

export const acceptLabTestsSecureSchema = z.object({
  selectedTests: z.array(selectedLabTestSchema).min(1, 'Select at least one laboratory test.'),
});

export const saveLabTestResultSecureSchema = z.object({
  resultValue: z.string().trim().optional().nullable(),
  resultText: z.string().trim().optional().nullable(),
  unit: z.string().trim().optional().nullable(),
  referenceRange: z.string().trim().optional().nullable(),
  flag: z.enum(['NORMAL', 'LOW', 'HIGH', 'CRITICAL', 'ABNORMAL']).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).refine(
  (value) => Boolean(value.resultValue || value.resultText || value.notes),
  'Enter a result value, text result, or note before saving.'
);

export const completeLabTestSecureSchema = z.object({
  confirmation: z.literal(true).optional(),
});

export const pushLabResultSecureSchema = z.object({
  clinicianId: uuidOrId.optional(),
  deliveryNote: z.string().trim().max(1000).optional().nullable(),
});

export const saveScanResultSecureSchema = z.object({
  findings: z.string().trim().max(10000).optional().nullable(),
  impression: z.string().trim().max(5000).optional().nullable(),
  conclusion: z.string().trim().max(5000).optional().nullable(),
  recommendation: z.string().trim().max(5000).optional().nullable(),
}).refine(
  (value) => Boolean(value.findings || value.impression || value.conclusion),
  'Enter findings, impression, or conclusion before saving the scan result.'
);

export const facilitySecureCreateSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_-]+$/i, 'Facility code can only contain letters, numbers, underscores, or hyphens.'),
  type: z.string().trim().min(2).max(80),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

export const facilityFeatureSecureSchema = z.object({
  features: z.array(z.object({
    key: z.string().trim().min(2).max(80),
    enabled: z.boolean(),
  })).min(1),
});

export const facilityCatalogSecureSchema = z.object({
  catalog: z.array(z.object({
    serviceId: z.string().trim().optional().nullable(),
    name: z.string().trim().min(2).max(150),
    type: z.enum(['LAB', 'SCAN', 'IMAGING', 'OTHER']),
    enabled: z.boolean().default(true),
    price: z.number().nonnegative().optional().nullable(),
    turnaroundTime: z.string().trim().max(80).optional().nullable(),
  })).min(1),
});

export function validateBody(schema: z.ZodSchema) {
  return (req: any, _res: any, next: any) => {
    try {
      req.body = schema.parse(req.body || {});
      next();
    } catch (error) {
      next(error);
    }
  };
}
