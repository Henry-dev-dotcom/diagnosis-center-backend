import { AppointmentStatus, DeliveryChannel, ReportStatus, VisitStatus } from '@prisma/client';
import { z } from 'zod';
import { createPatientSchema } from './patient.validators.js';
import { dateRangeQueryBaseSchema, optionalNotesSchema } from './common.validators.js';

export const confirmOrderSchema = z.object({
  invoiceNow: z.boolean().default(true),
  notes: optionalNotesSchema
});

/*
  Membership details captured at the desk.

  Records staff see the member's card in front of them, which is the moment the
  details are worth correcting - so a check-in may update the membership on its
  way past, rather than requiring a separate trip to the patient's record.
*/
const checkInInsuranceSchema = z.object({
  provider: z.string().trim().min(1, 'The scheme or provider is required').max(100),
  policyNumber: z.string().trim().min(1, 'The membership number is required').max(60),
  expiresAt: z.coerce.date().optional(),
  /// Whether the details were checked against the member's own card.
  verified: z.boolean().default(false)
});

export const checkInSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  orderId: z.string().min(1, 'Order ID is required').optional(),
  appointmentId: z.string().min(1, 'Appointment ID is required').optional(),
  identityVerified: z.boolean().default(true),
  visitType: z.string().trim().max(80).optional(),
  notes: optionalNotesSchema,
  /// Whether this visit goes on the scheme or is paid for directly.
  insuranceUsed: z.boolean().default(false),
  insurance: checkInInsuranceSchema.optional()
}).refine((value) => !value.insuranceUsed || Boolean(value.insurance?.policyNumber), {
  // Checking a patient in on a scheme without recording which membership is
  // what produces a claim nobody can match to a member later.
  message: 'A membership number is required to check in on insurance',
  path: ['insurance']
});

export const createWalkInSchema = z.object({
  patient: createPatientSchema.optional(),
  patientId: z.string().min(1, 'Patient ID is required').optional(),
  hospitalId: z.string().min(1, 'Hospital ID is required').optional(),
  requestedItems: z.array(z.object({
    catalogItemId: z.string().min(1, 'Catalog item ID is required'),
    notes: z.string().trim().max(500).optional()
  })).min(1, 'At least one requested item is required'),
  invoiceNow: z.boolean().default(true),
  checkInNow: z.boolean().default(true),
  notes: optionalNotesSchema
}).refine((value) => Boolean(value.patient || value.patientId), {
  message: 'Provide either an existing patientId or new patient details',
  path: ['patientId']
});

export const appointmentSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  orderId: z.string().min(1, 'Order ID is required').optional(),
  doctorProfileId: z.string().min(1, 'Doctor profile ID is required').optional(),
  hospitalId: z.string().min(1, 'Hospital ID is required').optional(),
  scheduledAt: z.coerce.date({ error: 'Scheduled date/time is required' }),
  reason: z.string().trim().max(500).optional(),
  type: z.string().trim().max(80).optional(),
  roomOrArea: z.string().trim().max(120).optional(),
  status: z.nativeEnum(AppointmentStatus).default(AppointmentStatus.SCHEDULED),
  notes: optionalNotesSchema
});

export const updateAppointmentSchema = appointmentSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one appointment field must be provided'
});

export const appointmentQuerySchema = dateRangeQueryBaseSchema.extend({
  patientId: z.string().min(1).optional(),
  doctorProfileId: z.string().min(1).optional(),
  hospitalId: z.string().min(1).optional(),
  status: z.nativeEnum(AppointmentStatus).optional()
});

export const dailyVisitsQuerySchema = dateRangeQueryBaseSchema.extend({
  patientId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  status: z.nativeEnum(VisitStatus).optional()
});

export const resultsInboxQuerySchema = dateRangeQueryBaseSchema.extend({
  status: z.nativeEnum(ReportStatus).optional()
});

export const sendResultNoticeSchema = z.object({
  channel: z.nativeEnum(DeliveryChannel).refine((value) => ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP'].includes(value), {
    message: 'Reception notices support SMS, WHATSAPP, EMAIL, or IN_APP only'
  }),
  recipient: z.string().trim().min(3, 'Recipient is required').max(160),
  message: z.string().trim().max(500, 'Notice cannot exceed 500 characters').optional()
});
