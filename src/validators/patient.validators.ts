import { z } from 'zod';
import { emailSchema, phoneSchema } from './common.validators.js';

const patientGenderSchema = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNKNOWN']).optional();

const patientBaseSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(80, 'First name cannot exceed 80 characters'),
  lastName: z.string().trim().min(2, 'Last name is required').max(80, 'Last name cannot exceed 80 characters'),
  dateOfBirth: z.coerce.date().optional(),
  gender: patientGenderSchema,
  phone: phoneSchema,
  email: emailSchema,
  address: z.string().trim().max(250, 'Address cannot exceed 250 characters').optional(),
  nationalId: z.string().trim().max(80, 'National ID cannot exceed 80 characters').optional(),
  insuranceProvider: z.string().trim().max(120, 'Insurance provider cannot exceed 120 characters').optional(),
  policyNumber: z.string().trim().max(120, 'Policy number cannot exceed 120 characters').optional(),
  emergencyContact: z.string().trim().max(160, 'Emergency contact cannot exceed 160 characters').optional(),
  allergiesAndConditions: z.string().trim().max(1000, 'Allergies and conditions cannot exceed 1000 characters').optional(),
  hospitalId: z.string().min(1, 'Hospital ID is required').optional(),
  referringDoctorId: z.string().min(1, 'Referring doctor ID is required').optional()
});

const hasPatientIdentifier = (value: Partial<z.infer<typeof patientBaseSchema>>) => Boolean(value.phone || value.email || value.nationalId);

export const createPatientSchema = patientBaseSchema.refine(hasPatientIdentifier, {
  message: 'At least one contact or identity field is required: phone, email, or nationalId',
  path: ['phone']
});

export const updatePatientSchema = patientBaseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one patient field must be provided'
});

export const checkDuplicatesSchema = z.object({
  firstName: z.string().trim().min(2).optional(),
  lastName: z.string().trim().min(2).optional(),
  dateOfBirth: z.coerce.date().optional(),
  phone: phoneSchema,
  email: emailSchema,
  nationalId: z.string().trim().max(80).optional(),
  policyNumber: z.string().trim().max(120).optional()
}).refine((value) => Object.values(value).some(Boolean), {
  message: 'Provide at least one value to check for duplicate patients'
});
