import { CatalogItemType, DepartmentType, EquipmentStatus, GenderRule, UserRole, UserStatus } from '@prisma/client';
import { z } from 'zod';
import { booleanQuerySchema, emailSchema, moneySchema, paginationQuerySchema, phoneSchema } from './common.validators.js';

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(60).transform((value) => value.toLowerCase()),
  email: emailSchema,
  role: z.nativeEnum(UserRole),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: emailSchema,
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one user field must be provided'
});

export const hospitalSchema = z.object({
  name: z.string().trim().min(2, 'Hospital name is required').max(160),
  code: z.string().trim().min(2, 'Hospital code is required').max(40).transform((value) => value.toUpperCase()),
  phone: phoneSchema,
  email: emailSchema,
  address: z.string().trim().max(250).optional(),
  billingContact: z.string().trim().max(160).optional(),
  accountStatus: z.string().trim().max(40).default('Active')
});

export const updateHospitalSchema = hospitalSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one hospital field must be provided'
});

export const doctorProfileSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  hospitalId: z.string().min(1).optional(),
  title: z.string().trim().max(20).default('Dr.'),
  specialty: z.string().trim().min(2, 'Specialty is required').max(120),
  licenseNumber: z.string().trim().min(2, 'License number is required').max(80),
  council: z.string().trim().max(160).optional(),
  phone: phoneSchema,
  email: emailSchema,
  status: z.string().trim().max(40).default('Active'),
  notificationEmail: z.boolean().default(true),
  notificationSms: z.boolean().default(false)
});

export const updateDoctorProfileSchema = doctorProfileSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one doctor profile field must be provided'
});

const catalogBaseSchema = z.object({
  catalogCode: z.string().trim().min(2, 'Catalog code is required').max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, 'Catalog item name is required').max(160),
  type: z.nativeEnum(CatalogItemType),
  departmentId: z.string().min(1).optional(),
  price: moneySchema,
  expectedCompletionHours: z.coerce.number().int().positive().max(720).default(24),
  sampleType: z.string().trim().max(80).optional(),
  modality: z.string().trim().max(40).optional(),
  aliases: z.array(z.string().trim().min(1).max(80)).default([]),
  isActive: z.boolean().default(true)
});

function validateCatalogTypeFields(value: Partial<z.infer<typeof catalogBaseSchema>>, ctx: z.RefinementCtx) {
  if (value.type === CatalogItemType.LAB && !value.sampleType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Sample type is required for lab catalog items', path: ['sampleType'] });
  }
  if (value.type === CatalogItemType.SCAN && !value.modality) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Modality is required for scan catalog items', path: ['modality'] });
  }
}

export const catalogSchema = catalogBaseSchema.superRefine(validateCatalogTypeFields);

export const updateCatalogSchema = catalogBaseSchema.partial().superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one catalog field must be provided' });
  }
  validateCatalogTypeFields(value, ctx);
});

const referenceRangeBaseSchema = z.object({
  catalogItemId: z.string().min(1, 'Catalog item ID is required'),
  parameterName: z.string().trim().min(1, 'Parameter name is required').max(120),
  unit: z.string().trim().max(40).optional(),
  low: z.coerce.number().optional(),
  high: z.coerce.number().optional(),
  criticalLow: z.coerce.number().optional(),
  criticalHigh: z.coerce.number().optional(),
  displayRange: z.string().trim().max(120).optional(),
  genderRule: z.nativeEnum(GenderRule).default(GenderRule.ALL),
  ageMin: z.coerce.number().int().nonnegative().optional(),
  ageMax: z.coerce.number().int().nonnegative().optional(),
  analyzerMethodNote: z.string().trim().max(250).optional()
});

function validateReferenceRangeBounds(value: Partial<z.infer<typeof referenceRangeBaseSchema>>, ctx: z.RefinementCtx) {
  if (value.low != null && value.high != null && value.low > value.high) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Low range cannot be greater than high range', path: ['low'] });
  }
  if (value.ageMin != null && value.ageMax != null && value.ageMin > value.ageMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Minimum age cannot be greater than maximum age', path: ['ageMin'] });
  }
}

export const referenceRangeSchema = referenceRangeBaseSchema.superRefine(validateReferenceRangeBounds);

export const updateReferenceRangeSchema = referenceRangeBaseSchema.partial().superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one reference range field must be provided' });
  }
  validateReferenceRangeBounds(value, ctx);
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name is required').max(120),
  code: z.string().trim().min(2, 'Department code is required').max(40).transform((value) => value.toUpperCase()),
  type: z.nativeEnum(DepartmentType),
  leadName: z.string().trim().max(120).optional(),
  isActive: z.boolean().default(true)
});

export const updateDepartmentSchema = departmentSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one department field must be provided'
});

export const equipmentSchema = z.object({
  departmentId: z.string().min(1, 'Department ID is required'),
  name: z.string().trim().min(2, 'Equipment name is required').max(120),
  room: z.string().trim().max(80).optional(),
  modality: z.string().trim().max(40).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  status: z.nativeEnum(EquipmentStatus).default(EquipmentStatus.AVAILABLE),
  serviceDueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional()
});

export const updateEquipmentSchema = equipmentSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one equipment field must be provided'
});


export const adminCatalogQuerySchema = paginationQuerySchema.extend({
  type: z.nativeEnum(CatalogItemType).optional(),
  isActive: booleanQuerySchema.optional()
});

export const referenceRangeQuerySchema = paginationQuerySchema.extend({
  catalogItemId: z.string().min(1).optional()
});
