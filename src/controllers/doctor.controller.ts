import type { Request, Response } from 'express';
import { prisma } from '../services/prisma.service.js';
import { createAuditLog, getRequestAuditContext } from '../services/audit.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/appError.js';
import { listPatients } from '../services/patient.service.js';

const doctorProfileInclude = {
  user: { select: { id: true, name: true, username: true, email: true, role: true, status: true } },
  hospital: { select: { id: true, name: true, code: true, phone: true, email: true, address: true } },
  _count: { select: { orders: true, referredPatients: true, appointments: true } }
};

export const getDoctorProfileController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: req.user.id }, include: doctorProfileInclude });
  if (!profile) throw new AppError('Doctor profile was not found for this user', 404, 'DOCTOR_PROFILE_NOT_FOUND');
  return sendSuccess(res, 'Doctor profile loaded successfully', profile);
});

export const updateOwnDoctorProfileController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await prisma.doctorProfile.findUnique({ where: { userId: req.user.id }, include: doctorProfileInclude });
  if (!before) throw new AppError('Doctor profile was not found for this user', 404, 'DOCTOR_PROFILE_NOT_FOUND');

  const body = req.body as Record<string, unknown>;
  const profile = await prisma.doctorProfile.update({
    where: { id: before.id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
      ...(body.specialty !== undefined ? { specialty: String(body.specialty).trim() } : {}),
      ...(body.licenseNumber !== undefined ? { licenseNumber: String(body.licenseNumber).trim() } : {}),
      ...(body.council !== undefined ? { council: body.council ? String(body.council).trim() : null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ? String(body.phone).trim() : null } : {}),
      ...(body.email !== undefined ? { email: body.email ? String(body.email).trim() : null } : {}),
      ...(body.notificationEmail !== undefined ? { notificationEmail: Boolean(body.notificationEmail) } : {}),
      ...(body.notificationSms !== undefined ? { notificationSms: Boolean(body.notificationSms) } : {})
    },
    include: doctorProfileInclude
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'DOCTOR_PROFILE_UPDATED',
    module: 'Doctor',
    entityType: 'DoctorProfile',
    entityId: profile.id,
    beforeData: before,
    afterData: profile
  });

  return sendSuccess(res, 'Doctor profile updated successfully', profile);
});

export const getOwnDoctorPatientsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listPatients(req.query, req.user);
  return sendSuccess(res, 'Referred patients loaded successfully', result);
});
