import { MessageChannel, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { MESSAGE_CHANNELS, MESSAGE_TTL_HOURS, canUseChannel, channelsForRole } from '../config/messageChannels.js';
import { AppError } from '../utils/appError.js';

/*
  Staff messaging.

  Two rules carry the whole design.

  First, a message lives 24 hours. Every read filters on that rather than
  trusting a cleaner to have run, so a message stops being visible exactly when
  it should even if nothing has swept it up. Expired rows are then deleted as
  they are encountered, which keeps the table from growing without needing a
  scheduler - and because that deletion is tenant-scoped like everything else,
  one facility's traffic never touches another's.

  Second, a channel belongs to the people in it. The check is on the way in and
  on the way out: a role that cannot read a channel cannot post to it either, and
  being able to name a channel is not the same as being in it.
*/

const senderSelect = { id: true, name: true, role: true } as const;

/** The 24-hour deadline for a message being sent now. */
function expiryFromNow() {
  return new Date(Date.now() + MESSAGE_TTL_HOURS * 60 * 60 * 1000);
}

/*
  Clears out what has already expired.

  Opportunistic rather than scheduled: it runs on the way past a read, inside the
  caller's facility. A facility nobody is using keeps a few dead rows, which costs
  nothing and is invisible, because no query will return them.
*/
async function removeExpired() {
  await prisma.staffMessage.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

function requireRole(req: Request): UserRole {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  return req.user.role as UserRole;
}

function assertChannel(channel: string, role: UserRole): MessageChannel {
  const definition = MESSAGE_CHANNELS.find((entry) => entry.key === channel);
  if (!definition) throw new AppError('That message channel does not exist', 404, 'MESSAGE_CHANNEL_NOT_FOUND');
  if (!canUseChannel(definition.key, role)) {
    throw new AppError('That channel belongs to another department', 403, 'MESSAGE_CHANNEL_FORBIDDEN');
  }
  return definition.key;
}

/** The channels this person can open, and how long a message lasts. */
export async function listChannels(req: Request) {
  const role = requireRole(req);
  await removeExpired();

  const allowed = channelsForRole(role);
  // How much is waiting in each, so somebody can see where to look without
  // opening every channel in turn.
  const counts = await prisma.staffMessage.groupBy({
    by: ['channel'],
    where: { channel: { in: allowed.map((entry) => entry.key) }, expiresAt: { gt: new Date() } },
    _count: { _all: true }
  });
  const countByChannel = new Map(counts.map((row) => [row.channel, row._count._all]));

  return {
    ttlHours: MESSAGE_TTL_HOURS,
    channels: allowed.map((entry) => ({
      key: entry.key,
      name: entry.name,
      description: entry.description,
      messageCount: countByChannel.get(entry.key) ?? 0
    }))
  };
}

/** One channel's conversation, oldest first, with nothing expired in it. */
export async function listMessages(channel: string, query: Request['query'], req: Request) {
  const role = requireRole(req);
  const key = assertChannel(channel, role);
  await removeExpired();

  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
  const messages = await prisma.staffMessage.findMany({
    where: { channel: key, expiresAt: { gt: new Date() } },
    include: { sender: { select: senderSelect } },
    orderBy: { createdAt: 'asc' },
    take: limit
  });

  return { channel: key, ttlHours: MESSAGE_TTL_HOURS, messages };
}

/** Posts a message, which the sender must be entitled to do. */
export async function sendMessage(body: { channel: string; body: string }, req: Request) {
  const role = requireRole(req);
  const key = assertChannel(body.channel, role);
  await removeExpired();

  const created = await prisma.staffMessage.create({
    data: {
      channel: key,
      senderId: req.user!.id,
      body: body.body.trim(),
      expiresAt: expiryFromNow()
    },
    include: { sender: { select: senderSelect } }
  });

  /*
    No audit entry.

    Everything else here is audited, so the omission is deliberate: an audit log
    is permanent, and writing the body of a message into it would keep forever
    exactly what the feature promises to discard after a day. The message itself
    is the record, and it expires.
  */
  return created;
}
