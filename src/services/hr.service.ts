import type { Request } from 'express';
import { LeaveStatus, LeaveType, Prisma, UserStatus, type EmploymentType } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { prisma } from './prisma.service.js';
import { permissionsInclude } from './facilityAccess.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { periodsOverlap, shiftConflict, shiftWindow, workingDays } from './rotaRules.js';
import { AppError } from '../utils/appError.js';

/*
  HR and the duty rota (Phase 4D). The rota refuses overlapping shifts, less
  than 11 hours' rest between shifts, and shifts during approved leave.
  Leave is approved by someone other than the person asking, never while they
  are still on the rota for those days, and annual leave is held to the
  person's yearly entitlement in working days.
*/

const DAY_MS = 86_400_000;
const DEFAULT_ANNUAL_LEAVE = 21;
const userSelect = { id: true, name: true, username: true, role: true, status: true } as const;

async function audit(req: Request, action: string, entityType: string, entityId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'HR', entityType, entityId, details });
}
const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/* ------------------------------------------------------------------- staff */

export async function listStaff() {
  const users = await prisma.user.findMany({ where: { status: UserStatus.ACTIVE }, orderBy: { name: 'asc' }, select: { ...userSelect, staffProfile: true } });
  const soon = new Date(Date.now() + 60 * DAY_MS);
  return {
    items: users.map((u) => {
      const expires = u.staffProfile?.registrationExpiresAt;
      return { ...u, registration: !expires ? null : expires < new Date() ? 'EXPIRED' : expires <= soon ? 'EXPIRING' : 'VALID' };
    })
  };
}

export async function saveProfile(
  userId: string,
  body: {
    staffNumber: string; jobTitle: string; unit?: string; employmentType?: EmploymentType; dateJoined?: Date; phone?: string; emergencyContact?: string;
    registrationBody?: string; registrationNumber?: string; registrationExpiresAt?: Date; annualLeaveDays?: number;
  },
  req: Request
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('Staff member not found', 404, 'USER_NOT_FOUND');
  try {
    const profile = await prisma.staffProfile.upsert({ where: { userId }, create: { userId, ...body }, update: body });
    await audit(req, 'STAFF_PROFILE_SAVED', 'StaffProfile', profile.id, { userId });
    return profile;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('That staff number is already in use', 409, 'STAFF_NUMBER_TAKEN');
    throw error;
  }
}

async function leaveBalance(userId: string, year: number) {
  const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { annualLeaveDays: true } });
  const entitlement = profile?.annualLeaveDays ?? DEFAULT_ANNUAL_LEAVE;
  const taken = await prisma.leaveRequest.aggregate({
    where: { userId, type: LeaveType.ANNUAL, status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] }, startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    _sum: { days: true }
  });
  const used = taken._sum.days ?? 0;
  return { year, entitlement, bookedOrPending: used, remaining: entitlement - used };
}

/** The signed-in person's own HR view. */
export async function myHr(req: Request) {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const today = dateOnly(new Date());
  const [profile, balance, rota, leave] = await Promise.all([
    prisma.staffProfile.findUnique({ where: { userId } }),
    leaveBalance(userId, today.getUTCFullYear()),
    prisma.rotaEntry.findMany({ where: { userId, date: { gte: today, lt: new Date(today.getTime() + 28 * DAY_MS) } }, orderBy: { date: 'asc' }, include: { shiftType: true } }),
    prisma.leaveRequest.findMany({ where: { userId }, orderBy: { startDate: 'desc' }, take: 20, include: { decidedBy: { select: { name: true } } } })
  ]);
  return { profile, balance, rota, leave };
}

/* ------------------------------------------------------------- shift types */

export async function listShiftTypes() {
  return { items: await prisma.shiftType.findMany({ where: { isActive: true }, orderBy: { startTime: 'asc' } }) };
}

export async function createShiftType(body: { code: string; name: string; startTime: string; endTime: string }, req: Request) {
  if (body.startTime === body.endTime) throw new AppError('A shift cannot start and end at the same time', 400, 'ZERO_LENGTH_SHIFT');
  try {
    const shift = await prisma.shiftType.create({ data: body });
    await audit(req, 'SHIFT_TYPE_CREATED', 'ShiftType', shift.id, body);
    return shift;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('A shift with that code already exists', 409, 'SHIFT_CODE_TAKEN');
    throw error;
  }
}

/* -------------------------------------------------------------------- rota */

export async function listRota(query: { from: Date; to: Date; unit?: string; userId?: string }) {
  const from = dateOnly(query.from);
  const to = dateOnly(query.to);
  if (to < from) throw new AppError('The end date is before the start date', 400, 'BAD_RANGE');
  if ((to.getTime() - from.getTime()) / DAY_MS > 62) throw new AppError('Show at most two months at a time', 400, 'RANGE_TOO_LONG');
  const [entries, leave] = await Promise.all([
    prisma.rotaEntry.findMany({
      where: { date: { gte: from, lte: to }, ...(query.unit ? { unit: query.unit } : {}), ...(query.userId ? { userId: query.userId } : {}) },
      orderBy: [{ date: 'asc' }, { shiftType: { startTime: 'asc' } }],
      include: { user: { select: { id: true, name: true, role: true } }, shiftType: true }
    }),
    prisma.leaveRequest.findMany({
      where: { status: LeaveStatus.APPROVED, startDate: { lte: to }, endDate: { gte: from }, ...(query.userId ? { userId: query.userId } : {}) },
      include: { user: { select: { id: true, name: true } } }
    })
  ]);
  return { entries, leave };
}

export async function assignShift(body: { userId: string; date: Date; shiftTypeId: string; unit: string; notes?: string }, req: Request) {
  const date = dateOnly(body.date);
  const user = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, name: true, status: true } });
  if (!user || user.status !== UserStatus.ACTIVE) throw new AppError('Choose an active staff member', 400, 'USER_NOT_FOUND');
  const shift = await prisma.shiftType.findUnique({ where: { id: body.shiftTypeId } });
  if (!shift || !shift.isActive) throw new AppError('Choose an active shift', 400, 'SHIFT_NOT_FOUND');

  const onLeave = await prisma.leaveRequest.findFirst({ where: { userId: user.id, status: LeaveStatus.APPROVED, startDate: { lte: date }, endDate: { gte: date } } });
  if (onLeave) throw new AppError(`${user.name} is on ${onLeave.type.toLowerCase()} leave that day`, 409, 'ON_LEAVE');

  // Shifts the day before and after matter for overlap and rest.
  const nearby = await prisma.rotaEntry.findMany({
    where: { userId: user.id, date: { gte: new Date(date.getTime() - DAY_MS), lte: new Date(date.getTime() + DAY_MS) } },
    include: { shiftType: true }
  });
  if (nearby.some((e) => e.shiftTypeId === shift.id && e.date.getTime() === date.getTime())) throw new AppError(`${user.name} is already on that shift`, 409, 'ALREADY_ON_SHIFT');
  const conflict = shiftConflict(
    shiftWindow(date, shift.startTime, shift.endTime),
    nearby.map((e) => ({ ...shiftWindow(e.date, e.shiftType.startTime, e.shiftType.endTime), label: `${e.shiftType.name} (${e.date.toISOString().slice(0, 10)})` }))
  );
  if (conflict) throw new AppError(`${user.name}: ${conflict.message}`, 409, conflict.code);

  try {
    const entry = await prisma.rotaEntry.create({ data: { userId: user.id, date, shiftTypeId: shift.id, unit: body.unit, notes: body.notes ?? null, assignedById: req.user?.id ?? null }, include: { user: { select: { id: true, name: true, role: true } }, shiftType: true } });
    await audit(req, 'ROTA_ASSIGNED', 'RotaEntry', entry.id, { userId: user.id, date: body.date, shift: shift.code });
    return entry;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(`${user.name} is already on that shift`, 409, 'ALREADY_ON_SHIFT');
    throw error;
  }
}

export async function removeShift(id: string, req: Request) {
  const entry = await prisma.rotaEntry.findUnique({ where: { id } });
  if (!entry) throw new AppError('Rota entry not found', 404, 'ROTA_ENTRY_NOT_FOUND');
  await prisma.rotaEntry.delete({ where: { id } });
  await audit(req, 'ROTA_REMOVED', 'RotaEntry', id, { userId: entry.userId, date: entry.date });
  return { removed: true };
}

/* ------------------------------------------------------------------- leave */

const leaveInclude = { user: { select: { id: true, name: true, role: true } }, decidedBy: { select: { id: true, name: true } } } as const;

export async function listLeave(query: { status?: LeaveStatus }, req: Request) {
  const approver = permissionsInclude(req.user?.permissions ?? [], PERMISSIONS.HR_LEAVE_APPROVE);
  const items = await prisma.leaveRequest.findMany({
    where: { ...(query.status ? { status: query.status } : {}), ...(approver ? {} : { userId: req.user?.id ?? '__none__' }) },
    orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
    take: 200,
    include: leaveInclude
  });
  return { items };
}

export async function requestLeave(body: { type: LeaveType; startDate: Date; endDate: Date; reason?: string }, req: Request) {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const start = dateOnly(body.startDate);
  const end = dateOnly(body.endDate);
  if (end < start) throw new AppError('The leave ends before it starts', 400, 'BAD_RANGE');
  if (start < new Date(Date.now() - 30 * DAY_MS)) throw new AppError('Leave cannot start more than 30 days ago', 400, 'LEAVE_TOO_OLD');
  const days = workingDays(start, end);
  if (days === 0) throw new AppError('That period has no working days', 400, 'NO_WORKING_DAYS');

  const own = await prisma.leaveRequest.findMany({ where: { userId, status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] } } });
  const clash = own.find((l) => periodsOverlap(l.startDate, l.endDate, start, end));
  if (clash) throw new AppError(`This overlaps your ${clash.status.toLowerCase()} ${clash.type.toLowerCase()} leave from ${clash.startDate.toISOString().slice(0, 10)}`, 409, 'LEAVE_OVERLAP');
  if (body.type === LeaveType.ANNUAL) {
    const balance = await leaveBalance(userId, start.getUTCFullYear());
    if (days > balance.remaining) throw new AppError(`That is ${days} working days; you have ${balance.remaining} of ${balance.entitlement} annual leave days left in ${balance.year}`, 409, 'NOT_ENOUGH_LEAVE');
  }
  const leave = await prisma.leaveRequest.create({ data: { userId, type: body.type, startDate: start, endDate: end, days, reason: body.reason ?? null }, include: leaveInclude });
  await audit(req, 'LEAVE_REQUESTED', 'LeaveRequest', leave.id, { type: body.type, days });
  return leave;
}

export async function decideLeave(id: string, body: { decision: 'APPROVE' | 'REJECT'; note?: string }, req: Request) {
  const leave = await prisma.leaveRequest.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!leave) throw new AppError('Leave request not found', 404, 'LEAVE_NOT_FOUND');
  if (leave.status !== LeaveStatus.PENDING) throw new AppError(`This request has already been ${leave.status.toLowerCase()}`, 409, 'LEAVE_DECIDED');
  if (leave.userId === req.user?.id) throw new AppError('Someone else must decide on your own leave', 403, 'LEAVE_SELF_APPROVAL');
  if (body.decision === 'REJECT' && !body.note) throw new AppError('Give the reason for refusing', 400, 'NOTE_REQUIRED');
  if (body.decision === 'APPROVE') {
    const rota = await prisma.rotaEntry.findMany({ where: { userId: leave.userId, date: { gte: leave.startDate, lte: leave.endDate } }, orderBy: { date: 'asc' }, select: { date: true } });
    if (rota.length) {
      throw new AppError(`${leave.user.name} is on the rota on ${rota.map((r) => r.date.toISOString().slice(0, 10)).join(', ')}; find cover and take them off first`, 409, 'ROTA_CONFLICT');
    }
  }
  const changed = await prisma.leaveRequest.updateMany({
    where: { id, status: LeaveStatus.PENDING },
    data: { status: body.decision === 'APPROVE' ? LeaveStatus.APPROVED : LeaveStatus.REJECTED, decidedById: req.user?.id ?? null, decidedAt: new Date(), decisionNote: body.note ?? null }
  });
  if (changed.count !== 1) throw new AppError('This request was just decided by someone else', 409, 'LEAVE_DECIDED');
  await audit(req, body.decision === 'APPROVE' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', 'LeaveRequest', id, { note: body.note });
  return prisma.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveInclude });
}

/** The requester withdraws a pending request, or approved leave that has not started. */
export async function cancelLeave(id: string, req: Request) {
  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave || leave.userId !== req.user?.id) throw new AppError('Leave request not found', 404, 'LEAVE_NOT_FOUND');
  const started = leave.startDate <= dateOnly(new Date());
  if (leave.status === LeaveStatus.REJECTED || leave.status === LeaveStatus.CANCELLED || (leave.status === LeaveStatus.APPROVED && started)) {
    throw new AppError(leave.status === LeaveStatus.APPROVED ? 'Leave that has started cannot be withdrawn here; ask HR' : `This request is ${leave.status.toLowerCase()}`, 409, 'LEAVE_NOT_CANCELLABLE');
  }
  await prisma.leaveRequest.update({ where: { id }, data: { status: LeaveStatus.CANCELLED } });
  await audit(req, 'LEAVE_CANCELLED', 'LeaveRequest', id);
  return prisma.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveInclude });
}
