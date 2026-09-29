import { EmploymentType, LeaveStatus, LeaveType } from '@prisma/client';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM');
const day = z.coerce.date();

export const profileSchema = z.object({
  staffNumber: z.string().trim().min(2, 'Staff number is required').max(30),
  jobTitle: z.string().trim().min(2, 'Job title is required').max(120),
  unit: optionalText(120),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  dateJoined: day.optional(),
  phone: optionalText(40),
  emergencyContact: optionalText(200),
  registrationBody: optionalText(120),
  registrationNumber: optionalText(60),
  registrationExpiresAt: day.optional(),
  annualLeaveDays: z.coerce.number().int().min(0).max(60).optional()
});

export const shiftTypeSchema = z.object({
  code: z.string().trim().min(1).max(10).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2).max(60),
  startTime: time,
  endTime: time
});

export const rotaQuerySchema = z.object({ from: day, to: day, unit: optionalText(120), userId: z.string().min(1).optional() });
export const assignSchema = z.object({
  userId: z.string().min(1, 'Choose the staff member'),
  date: day,
  shiftTypeId: z.string().min(1, 'Choose the shift'),
  unit: z.string().trim().min(2, 'Say which ward or unit').max(120),
  notes: optionalText(300)
});

export const leaveQuerySchema = z.object({ status: z.nativeEnum(LeaveStatus).optional() });
export const leaveSchema = z.object({ type: z.nativeEnum(LeaveType), startDate: day, endDate: day, reason: optionalText(500) });
export const decisionSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT']), note: optionalText(500) });
