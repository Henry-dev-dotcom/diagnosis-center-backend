import { MessageChannel, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import {
  DIRECT_MESSAGE_DEPARTMENTS,
  MESSAGE_CHANNELS,
  MESSAGE_TTL_HOURS,
  canUseChannel,
  channelsForRole,
  departmentForRole
} from '../config/messageChannels.js';
import { AppError } from '../utils/appError.js';

/*
  Staff messaging.

  Group channels remain role-restricted. Direct department threads are visible
  only to the sender's department and the selected recipient department; a new
  picker must never make other departments' private history visible.

  Messages live 24 hours. Every read filters on the deadline, and expired rows
  are deleted opportunistically inside the caller's facility.
*/
const senderSelect = { id: true, name: true, role: true } as const;

/** The 24-hour deadline for a message being sent now. */
function expiryFromNow() {
  return new Date(Date.now() + MESSAGE_TTL_HOURS * 60 * 60 * 1000);
}

async function removeExpired() {
  await prisma.staffMessage.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

function requireRole(req: Request): UserRole {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  return req.user.role as UserRole;
}

function requireDepartment(role: UserRole) {
  const department = departmentForRole(role);
  if (!department) throw new AppError('Your role is not assigned to a messaging department', 403, 'MESSAGE_DEPARTMENT_FORBIDDEN');
  return department;
}

function assertChannel(channel: string, role: UserRole): MessageChannel {
  const definition = MESSAGE_CHANNELS.find((entry) => entry.key === channel);
  if (!definition) throw new AppError('That message channel does not exist', 404, 'MESSAGE_CHANNEL_NOT_FOUND');
  if (!canUseChannel(definition.key, role)) {
    throw new AppError('That channel belongs to another department', 403, 'MESSAGE_CHANNEL_FORBIDDEN');
  }
  return definition.key;
}

/** The shared/role-limited channels and other departments available to this user. */
export async function listChannels(req: Request) {
  const role = requireRole(req);
  await removeExpired();

  const allowed = channelsForRole(role);
  const counts = await prisma.staffMessage.groupBy({
    by: ['channel'],
    where: {
      channel: { in: allowed.map((entry) => entry.key) },
      recipientDepartment: null,
      expiresAt: { gt: new Date() }
    },
    _count: { _all: true }
  });
  const countByChannel = new Map(counts.map((row) => [row.channel, row._count._all]));
  const ownDepartment = departmentForRole(role);

  return {
    ttlHours: MESSAGE_TTL_HOURS,
    channels: allowed.map((entry) => ({
      key: entry.key,
      name: entry.name,
      description: entry.description,
      messageCount: countByChannel.get(entry.key) ?? 0
    })),
    ownDepartment: ownDepartment
      ? DIRECT_MESSAGE_DEPARTMENTS.find((entry) => entry.key === ownDepartment) ?? null
      : null,
    directDepartments: DIRECT_MESSAGE_DEPARTMENTS.filter((entry) => entry.key !== ownDepartment)
  };
}

/** One shared or role-limited channel's conversation, oldest first. */
export async function listMessages(channel: string, query: Request['query'], req: Request) {
  const role = requireRole(req);
  const key = assertChannel(channel, role);
  await removeExpired();

  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
  const messages = await prisma.staffMessage.findMany({
    where: { channel: key, recipientDepartment: null, expiresAt: { gt: new Date() } },
    include: { sender: { select: senderSelect } },
    orderBy: { createdAt: 'asc' },
    take: limit
  });

  return { channel: key, ttlHours: MESSAGE_TTL_HOURS, messages };
}

/** A two-department thread. Neither department can read another pair's messages. */
export async function listDepartmentMessages(department: string, query: Request['query'], req: Request) {
  const role = requireRole(req);
  const ownDepartment = requireDepartment(role);
  const target = DIRECT_MESSAGE_DEPARTMENTS.find((entry) => entry.key === department);
  if (!target) throw new AppError('That department does not exist', 404, 'MESSAGE_DEPARTMENT_NOT_FOUND');
  if (target.key === ownDepartment) throw new AppError('Choose a different department', 400, 'MESSAGE_DEPARTMENT_SELF');
  await removeExpired();

  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
  const messages = await prisma.staffMessage.findMany({
    where: {
      expiresAt: { gt: new Date() },
      OR: [
        { senderDepartment: ownDepartment, recipientDepartment: target.key },
        { senderDepartment: target.key, recipientDepartment: ownDepartment }
      ]
    },
    include: { sender: { select: senderSelect } },
    orderBy: { createdAt: 'asc' },
    take: limit
  });

  return { department: target, ownDepartment, ttlHours: MESSAGE_TTL_HOURS, messages };
}

/** Posts to a group channel or creates a private thread message for a department. */
export async function sendMessage(
  body: { channel?: string; recipientDepartment?: string; body: string },
  req: Request
) {
  const role = requireRole(req);
  await removeExpired();

  let data;
  if (body.recipientDepartment) {
    const senderDepartment = requireDepartment(role);
    const target = DIRECT_MESSAGE_DEPARTMENTS.find((entry) => entry.key === body.recipientDepartment);
    if (!target) throw new AppError('That department does not exist', 404, 'MESSAGE_DEPARTMENT_NOT_FOUND');
    if (target.key === senderDepartment) throw new AppError('Choose a different department', 400, 'MESSAGE_DEPARTMENT_SELF');
    data = {
      channel: MessageChannel.ALL,
      senderDepartment,
      recipientDepartment: target.key,
      senderId: req.user!.id,
      body: body.body.trim(),
      expiresAt: expiryFromNow()
    };
  } else {
    if (!body.channel) throw new AppError('Choose a message channel or department', 400, 'MESSAGE_DESTINATION_REQUIRED');
    const key = assertChannel(body.channel, role);
    data = {
      channel: key,
      senderId: req.user!.id,
      body: body.body.trim(),
      expiresAt: expiryFromNow()
    };
  }

  const created = await prisma.staffMessage.create({
    data,
    include: { sender: { select: senderSelect } }
  });

  /*
    No audit entry: audit logs are permanent, while this message is deliberately
    temporary. Anything that must be retained belongs on the patient's chart.
  */
  return created;
}
