import { z } from 'zod';

const id = z.string().trim().min(1);
const itemSchema = z.object({
  id: z.string().optional(),
  catalogId: z.string().optional(),
  serviceId: z.string().optional(),
  testId: z.string().optional(),
  scanId: z.string().optional(),
  code: z.string().optional(),
  serviceCode: z.string().optional(),
  testCode: z.string().optional(),
  scanCode: z.string().optional(),
  name: z.string().optional(),
  label: z.string().optional(),
  serviceName: z.string().optional(),
  testName: z.string().optional(),
  scanName: z.string().optional(),
  price: z.union([z.number(), z.string()]).optional().nullable(),
  quantity: z.union([z.number(), z.string()]).optional(),
  referenceRange: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional(),
}).passthrough();

export const createWalkInPatientSchema = z.object({
  body: z.object({
    fullName: z.string().trim().optional(),
    name: z.string().trim().optional(),
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    phone: z.string().trim().optional().nullable(),
    email: z.string().trim().email().optional().nullable(),
    gender: z.string().trim().optional().nullable(),
    dateOfBirth: z.string().optional().nullable(),
    age: z.union([z.string(), z.number()]).optional().nullable(),
    address: z.string().trim().optional().nullable(),
  }).passthrough().refine((data) => data.fullName || data.name || data.firstName || data.lastName || data.phone, {
    message: 'Patient name or phone number is required.',
  }),
});

export const requestWalkInLabsSchema = z.object({
  params: z.object({ patientId: id }),
  body: z.object({
    clinicianId: z.string().optional().nullable(),
    doctorId: z.string().optional().nullable(),
    priority: z.string().optional().nullable(),
    urgency: z.string().optional().nullable(),
    clinicalNotes: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    paymentStatus: z.string().optional().nullable(),
    invoiceId: z.string().optional().nullable(),
    tests: z.array(itemSchema).optional(),
    items: z.array(itemSchema).optional(),
  }).refine((data) => (data.tests?.length || data.items?.length || 0) > 0, {
    message: 'Select at least one laboratory test.',
  }),
});

export const requestWalkInScansSchema = z.object({
  params: z.object({ patientId: id }),
  body: z.object({
    clinicianId: z.string().optional().nullable(),
    doctorId: z.string().optional().nullable(),
    priority: z.string().optional().nullable(),
    urgency: z.string().optional().nullable(),
    clinicalNotes: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    paymentStatus: z.string().optional().nullable(),
    invoiceId: z.string().optional().nullable(),
    scans: z.array(itemSchema).optional(),
    items: z.array(itemSchema).optional(),
  }).refine((data) => (data.scans?.length || data.items?.length || 0) > 0, {
    message: 'Select at least one scan.',
  }),
});

export const patientIdParamSchema = z.object({
  params: z.object({ patientId: id }),
});

export const receptionSearchQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    requestType: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    take: z.string().optional(),
    skip: z.string().optional(),
  }),
});
