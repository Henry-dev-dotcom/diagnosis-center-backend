import { randomBytes } from 'node:crypto';
import {
  AnalyzerDeviceStatus,
  AnalyzerMessageStatus,
  AnalyzerProtocol,
  CatalogItemType,
  Prisma
} from '@prisma/client';
import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.service.js';
import { nextCode as issueCode } from '../codeSequence.service.js';
import { createAuditLog, getRequestAuditContext } from '../audit.service.js';
import { getPagination, paginationMeta, safeOrderBy } from '../query.service.js';
import { AppError } from '../../utils/appError.js';
import { applyAnalyzerMessage, ingestAnalyzerPayload, type IngestOutcome } from './ingest.service.js';
import { detectProtocol } from './parsers.js';

/*
  Registering analyzers, mapping their test codes, and looking at what they sent.

  The key an analyzer authenticates with is generated here, shown once, and
  stored only as a hash — the same treatment a staff password gets, because it
  grants the same ability to write to patient records.
*/

const KEY_PREFIX = 'lhims_anz';
const SALT_ROUNDS = 12;

const deviceSelect = {
  id: true,
  deviceCode: true,
  name: true,
  make: true,
  model: true,
  serialNumber: true,
  protocol: true,
  departmentId: true,
  status: true,
  // The hash is never selected: nothing outside this file needs it, and it must
  // not be able to leak into an API response by accident.
  apiKeyPrefix: true,
  apiKeyIssuedAt: true,
  apiKeyLastUsedAt: true,
  autoSubmitForReview: true,
  acceptUnmappedTests: true,
  lastMessageAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true, role: true } },
  _count: { select: { testMaps: true, messages: true } }
} satisfies Prisma.AnalyzerDeviceSelect;

export type DevicePayload = {
  name: string;
  protocol: AnalyzerProtocol;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  departmentId?: string | null;
  autoSubmitForReview?: boolean;
  acceptUnmappedTests?: boolean;
  notes?: string | null;
};

export type TestMapPayload = {
  deviceId?: string | null;
  analyzerCode: string;
  catalogItemId: string;
  referenceParameterId?: string | null;
  factor?: number | string | null;
  unitOverride?: string | null;
  isActive?: boolean;
};

function clean(value: unknown) {
  if (typeof value !== 'string') return (value ?? null) as null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/* ------------------------------------------------------------------- keys -- */

/**
 * A fresh key: a public prefix we can look it up by, and a secret half we only
 * ever keep hashed. Shown to the person once, at the moment it is issued.
 */
async function issueKey() {
  // Hex, not base64url: the key's own parts are separated by underscores, and the
  // base64url alphabet contains one, which would make the key unreadable.
  const prefix = randomBytes(5).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const plaintext = `${KEY_PREFIX}_${prefix}_${secret}`;
  return { plaintext, prefix, hash: await bcrypt.hash(plaintext, SALT_ROUNDS) };
}

/** Split a presented key back into the prefix we index and the whole string we verify. */
export function readKeyPrefix(presented: string) {
  // lhims_anz_<prefix>_<secret>, with both halves hex, so exactly four parts.
  const parts = presented.trim().split('_');
  if (parts.length !== 4 || `${parts[0]}_${parts[1]}` !== KEY_PREFIX) return null;
  return /^[0-9a-f]+$/.test(parts[2]) ? parts[2] : null;
}

/* ---------------------------------------------------------------- devices -- */

export async function listAnalyzerDevices(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.AnalyzerDeviceWhereInput = {
    ...(query.status ? { status: String(query.status) as AnalyzerDeviceStatus } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { deviceCode: { contains: search, mode: 'insensitive' } },
            { make: { contains: search, mode: 'insensitive' } },
            { model: { contains: search, mode: 'insensitive' } },
            { serialNumber: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.analyzerDevice.findMany({ where, select: deviceSelect, orderBy: safeOrderBy(sortBy, sortOrder, ['name', 'createdAt', 'lastMessageAt', 'deviceCode'] as const, 'name'), skip, take }),
    prisma.analyzerDevice.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function getAnalyzerDevice(id: string) {
  const device = await prisma.analyzerDevice.findUnique({ where: { id }, select: deviceSelect });
  if (!device) throw new AppError('That analyzer was not found', 404, 'ANALYZER_DEVICE_NOT_FOUND');
  return device;
}

export async function createAnalyzerDevice(body: DevicePayload, req: Request) {
  if (body.departmentId) await assertDepartment(body.departmentId);
  const key = await issueKey();

  const device = await prisma.$transaction(async (tx) => {
    const created = await tx.analyzerDevice.create({
      data: {
        deviceCode: await issueCode(tx, 'ANZ'),
        name: body.name.trim(),
        make: clean(body.make),
        model: clean(body.model),
        serialNumber: clean(body.serialNumber),
        protocol: body.protocol,
        departmentId: body.departmentId ?? null,
        autoSubmitForReview: body.autoSubmitForReview ?? false,
        acceptUnmappedTests: body.acceptUnmappedTests ?? false,
        notes: clean(body.notes),
        apiKeyHash: key.hash,
        apiKeyPrefix: key.prefix,
        createdById: req.user?.id ?? null
      },
      select: deviceSelect
    });
    return created;
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ANALYZER_DEVICE_REGISTERED',
    module: 'Lab',
    entityType: 'AnalyzerDevice',
    entityId: device.id,
    // The key itself is deliberately absent: an audit row must not become a
    // second place the credential lives.
    afterData: { ...device, apiKeyPrefix: device.apiKeyPrefix },
    details: { protocol: device.protocol }
  });

  return { device, apiKey: key.plaintext };
}

export async function updateAnalyzerDevice(id: string, body: Partial<DevicePayload> & { status?: AnalyzerDeviceStatus }, req: Request) {
  const before = await getAnalyzerDevice(id);
  if (body.departmentId) await assertDepartment(body.departmentId);

  const device = await prisma.analyzerDevice.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.protocol !== undefined ? { protocol: body.protocol } : {}),
      ...(body.make !== undefined ? { make: clean(body.make) } : {}),
      ...(body.model !== undefined ? { model: clean(body.model) } : {}),
      ...(body.serialNumber !== undefined ? { serialNumber: clean(body.serialNumber) } : {}),
      ...(body.departmentId !== undefined ? { departmentId: body.departmentId ?? null } : {}),
      ...(body.autoSubmitForReview !== undefined ? { autoSubmitForReview: body.autoSubmitForReview } : {}),
      ...(body.acceptUnmappedTests !== undefined ? { acceptUnmappedTests: body.acceptUnmappedTests } : {}),
      ...(body.notes !== undefined ? { notes: clean(body.notes) } : {}),
      ...(body.status !== undefined ? { status: body.status } : {})
    },
    select: deviceSelect
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ANALYZER_DEVICE_UPDATED',
    module: 'Lab',
    entityType: 'AnalyzerDevice',
    entityId: id,
    beforeData: before,
    afterData: device
  });
  return device;
}

/**
 * Issue a new key and invalidate the old one at the same moment. The analyzer
 * stops being able to send until its bridge is given the new key, which is the
 * point: a key believed to be known by someone else must stop working now.
 */
export async function rotateAnalyzerDeviceKey(id: string, req: Request) {
  const before = await getAnalyzerDevice(id);
  const key = await issueKey();
  const device = await prisma.analyzerDevice.update({
    where: { id },
    data: { apiKeyHash: key.hash, apiKeyPrefix: key.prefix, apiKeyIssuedAt: new Date(), apiKeyLastUsedAt: null },
    select: deviceSelect
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ANALYZER_DEVICE_KEY_ROTATED',
    module: 'Lab',
    entityType: 'AnalyzerDevice',
    entityId: id,
    details: { previousPrefix: before.apiKeyPrefix, newPrefix: device.apiKeyPrefix }
  });
  return { device, apiKey: key.plaintext };
}

async function assertDepartment(departmentId: string) {
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!department) throw new AppError('That department was not found', 404, 'DEPARTMENT_NOT_FOUND');
}

/* ------------------------------------------------------------- test maps -- */

const testMapInclude = {
  device: { select: { id: true, name: true, deviceCode: true } },
  catalogItem: { select: { id: true, catalogCode: true, name: true, type: true } },
  referenceParameter: { select: { id: true, name: true, unit: true } },
  createdBy: { select: { id: true, name: true } }
} satisfies Prisma.AnalyzerTestMapInclude;

export async function listAnalyzerTestMaps(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const deviceId = query.deviceId ? String(query.deviceId) : null;
  const where: Prisma.AnalyzerTestMapWhereInput = {
    // A device's own mappings plus the facility-wide ones, because both apply to it.
    ...(deviceId ? { OR: [{ deviceId }, { deviceId: null }] } : {}),
    ...(query.catalogItemId ? { catalogItemId: String(query.catalogItemId) } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { analyzerCode: { contains: search, mode: 'insensitive' } },
                { catalogItem: { name: { contains: search, mode: 'insensitive' } } },
                { referenceParameter: { name: { contains: search, mode: 'insensitive' } } }
              ]
            }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.analyzerTestMap.findMany({ where, include: testMapInclude, orderBy: safeOrderBy(sortBy, sortOrder, ['analyzerCode', 'createdAt', 'updatedAt'] as const, 'analyzerCode'), skip, take }),
    prisma.analyzerTestMap.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function upsertAnalyzerTestMap(body: TestMapPayload, req: Request) {
  const analyzerCode = body.analyzerCode.trim();
  if (!analyzerCode) throw new AppError('The analyzer code is required', 422, 'ANALYZER_CODE_REQUIRED');

  const catalogItem = await prisma.catalogItem.findUnique({
    where: { id: body.catalogItemId },
    select: { id: true, name: true, type: true, parameters: { select: { id: true } } }
  });
  if (!catalogItem) throw new AppError('That test was not found in the catalog', 404, 'CATALOG_ITEM_NOT_FOUND');
  if (catalogItem.type !== CatalogItemType.LAB) throw new AppError('Only laboratory tests can be mapped to an analyzer', 422, 'NOT_LAB_CATALOG_ITEM');

  // A mapping that points at a field belonging to a different test would silently
  // put the value on the wrong report.
  if (body.referenceParameterId && !catalogItem.parameters.some((parameter) => parameter.id === body.referenceParameterId)) {
    throw new AppError(`That field does not belong to ${catalogItem.name}`, 422, 'REFERENCE_PARAMETER_MISMATCH');
  }
  if (body.deviceId) await getAnalyzerDevice(body.deviceId);

  const factor = body.factor === null || body.factor === undefined || body.factor === '' ? null : Number(body.factor);
  if (factor !== null && (!Number.isFinite(factor) || factor === 0)) throw new AppError('The conversion factor must be a number other than zero', 422, 'ANALYZER_FACTOR_INVALID');

  const deviceId = body.deviceId ?? null;
  const existing = await prisma.analyzerTestMap.findFirst({
    where: { deviceId, analyzerCode: { equals: analyzerCode, mode: 'insensitive' } }
  });

  const data = {
    analyzerCode,
    catalogItemId: catalogItem.id,
    referenceParameterId: body.referenceParameterId ?? null,
    factor,
    unitOverride: clean(body.unitOverride),
    isActive: body.isActive ?? true
  };

  const map = existing
    ? await prisma.analyzerTestMap.update({ where: { id: existing.id }, data, include: testMapInclude })
    : await prisma.analyzerTestMap.create({ data: { ...data, deviceId, createdById: req.user?.id ?? null }, include: testMapInclude });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: existing ? 'ANALYZER_TEST_MAP_UPDATED' : 'ANALYZER_TEST_MAP_CREATED',
    module: 'Lab',
    entityType: 'AnalyzerTestMap',
    entityId: map.id,
    beforeData: existing,
    afterData: map
  });
  return map;
}

export async function deleteAnalyzerTestMap(id: string, req: Request) {
  const before = await prisma.analyzerTestMap.findUnique({ where: { id }, include: testMapInclude });
  if (!before) throw new AppError('That mapping was not found', 404, 'ANALYZER_TEST_MAP_NOT_FOUND');
  await prisma.analyzerTestMap.delete({ where: { id } });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ANALYZER_TEST_MAP_DELETED',
    module: 'Lab',
    entityType: 'AnalyzerTestMap',
    entityId: id,
    beforeData: before
  });
  return { id };
}

/**
 * Codes the analyzers have actually sent that nothing maps, newest first. This is
 * what makes setting up a new instrument tractable: run one sample, then map the
 * codes it really used instead of reading the manual.
 */
export async function listUnmappedAnalyzerCodes(query: Request['query']) {
  const deviceId = query.deviceId ? String(query.deviceId) : null;
  const messages = await prisma.analyzerMessage.findMany({
    where: {
      ...(deviceId ? { deviceId } : {}),
      status: { in: [AnalyzerMessageStatus.UNMATCHED, AnalyzerMessageStatus.PARTIAL, AnalyzerMessageStatus.APPLIED] },
      parsed: { not: Prisma.DbNull }
    },
    orderBy: { receivedAt: 'desc' },
    take: 200,
    select: { parsed: true, deviceId: true, receivedAt: true, device: { select: { id: true, name: true } } }
  });

  const maps = await prisma.analyzerTestMap.findMany({ where: { isActive: true }, select: { analyzerCode: true, deviceId: true } });
  const mapped = new Set(maps.map((map) => `${map.deviceId ?? '*'}:${map.analyzerCode.trim().toLowerCase()}`));
  const facilityWide = new Set(maps.filter((map) => map.deviceId === null).map((map) => map.analyzerCode.trim().toLowerCase()));

  /*
    A code whose value has actually landed on a result needs no mapping, even
    though no mapping row exists: it matched one of our field names on its own.
    Listing it would send the bench off to configure something that already works.
  */
  const landed = await prisma.labResultParameter.findMany({
    where: { source: 'ANALYZER', analyzerCode: { not: null } },
    select: { analyzerCode: true },
    distinct: ['analyzerCode']
  });
  const alreadyWorking = new Set(landed.map((parameter) => (parameter.analyzerCode ?? '').trim().toLowerCase()));

  const seen = new Map<string, { analyzerCode: string; label: string | null; sampleUnit: string | null; exampleValue: string | null; deviceId: string; deviceName: string; lastSeenAt: Date; occurrences: number }>();
  for (const message of messages) {
    const readings = Array.isArray(message.parsed) ? (message.parsed as unknown as Array<{ observations?: Array<Record<string, string | null>> }>) : [];
    for (const reading of readings) {
      for (const observation of reading.observations ?? []) {
        const code = (observation.code ?? '').trim();
        if (!code) continue;
        const lower = code.toLowerCase();
        if (mapped.has(`${message.deviceId}:${lower}`) || facilityWide.has(lower) || alreadyWorking.has(lower)) continue;
        const key = `${message.deviceId}:${lower}`;
        const existing = seen.get(key);
        if (existing) {
          existing.occurrences += 1;
          continue;
        }
        seen.set(key, {
          analyzerCode: code,
          label: observation.label ?? null,
          sampleUnit: observation.unit ?? null,
          exampleValue: observation.value ?? null,
          deviceId: message.deviceId,
          deviceName: message.device.name,
          lastSeenAt: message.receivedAt,
          occurrences: 1
        });
      }
    }
  }

  return { items: [...seen.values()].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime()) };
}

/* ---------------------------------------------------------------- messages -- */

const messageInclude = {
  device: { select: { id: true, name: true, deviceCode: true, protocol: true } },
  sample: { select: { id: true, sampleCode: true, patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } } } },
  labResult: { select: { id: true, resultCode: true, status: true } },
  resolvedBy: { select: { id: true, name: true, role: true } }
} satisfies Prisma.AnalyzerMessageInclude;

// The list leaves out rawPayload, which can be tens of kilobytes per message and
// is only ever wanted one message at a time.
const messageListSelect = {
  id: true,
  deviceId: true,
  contentType: true,
  status: true,
  analyzerSampleId: true,
  sampleId: true,
  labResultId: true,
  appliedCount: true,
  skippedCount: true,
  error: true,
  resolvedAt: true,
  resolutionNote: true,
  receivedAt: true,
  processedAt: true,
  ...messageInclude
} satisfies Prisma.AnalyzerMessageSelect;

export async function listAnalyzerMessages(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.AnalyzerMessageWhereInput = {
    ...(query.deviceId ? { deviceId: String(query.deviceId) } : {}),
    ...(query.status ? { status: String(query.status) as AnalyzerMessageStatus } : {}),
    ...(query.from || query.to
      ? { receivedAt: { ...(query.from ? { gte: new Date(String(query.from)) } : {}), ...(query.to ? { lte: new Date(String(query.to)) } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { analyzerSampleId: { contains: search, mode: 'insensitive' } },
            { error: { contains: search, mode: 'insensitive' } },
            { sample: { sampleCode: { contains: search, mode: 'insensitive' } } },
            { labResult: { resultCode: { contains: search, mode: 'insensitive' } } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.analyzerMessage.findMany({
      where,
      select: messageListSelect,
      orderBy: safeOrderBy(sortBy, sortOrder, ['receivedAt', 'processedAt', 'status'] as const, 'receivedAt'),
      skip,
      take
    }),
    prisma.analyzerMessage.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function getAnalyzerMessage(id: string) {
  const message = await prisma.analyzerMessage.findUnique({ where: { id }, include: messageInclude });
  if (!message) throw new AppError('That analyzer message was not found', 404, 'ANALYZER_MESSAGE_NOT_FOUND');
  return message;
}

/**
 * Run a stored message through again, after a mapping was added or a sample was
 * accepted. The payload is untouched, so this is safe to repeat.
 */
export async function replayAnalyzerMessage(id: string, req: Request) {
  const message = await getAnalyzerMessage(id);
  if (message.status === AnalyzerMessageStatus.DISCARDED) throw new AppError('This message was discarded. Nothing will be applied from it.', 409, 'ANALYZER_MESSAGE_DISCARDED');

  const device = await prisma.analyzerDevice.findUniqueOrThrow({ where: { id: message.deviceId } });
  const outcome = await applyAnalyzerMessage(id, device, req.user?.id ?? null);

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ANALYZER_MESSAGE_REPLAYED',
    module: 'Lab',
    entityType: 'AnalyzerMessage',
    entityId: id,
    beforeData: { status: message.status, appliedCount: message.appliedCount, skippedCount: message.skippedCount },
    afterData: { status: outcome.status, appliedCount: outcome.applied, skippedCount: outcome.skipped },
    details: { notes: outcome.notes }
  });
  return { message: await getAnalyzerMessage(id), outcome };
}

export async function discardAnalyzerMessage(id: string, body: { reason: string }, req: Request) {
  const before = await getAnalyzerMessage(id);
  if (before.appliedCount > 0) {
    throw new AppError('Some of this message is already on a result, so discarding it would be misleading. Correct the result instead.', 409, 'ANALYZER_MESSAGE_ALREADY_APPLIED');
  }

  const message = await prisma.analyzerMessage.update({
    where: { id },
    data: { status: AnalyzerMessageStatus.DISCARDED, resolvedById: req.user?.id ?? null, resolvedAt: new Date(), resolutionNote: body.reason.trim() },
    include: messageInclude
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ANALYZER_MESSAGE_DISCARDED',
    module: 'Lab',
    entityType: 'AnalyzerMessage',
    entityId: id,
    beforeData: before,
    afterData: message,
    details: { reason: body.reason }
  });
  return message;
}

/* ----------------------------------------------------------- file upload -- */

/**
 * The path that needs no bridge installed: somebody exports the run from the
 * analyzer and uploads the file. Same pipeline, same safeguards; the only
 * difference is that a person is recorded as having brought it in.
 */
export async function uploadAnalyzerFile(body: { deviceId: string; content: string; filename?: string | null }, req: Request): Promise<{ outcome: IngestOutcome; message: Awaited<ReturnType<typeof getAnalyzerMessage>> }> {
  const device = await prisma.analyzerDevice.findUnique({ where: { id: body.deviceId } });
  if (!device) throw new AppError('That analyzer was not found', 404, 'ANALYZER_DEVICE_NOT_FOUND');
  if (device.status !== AnalyzerDeviceStatus.ACTIVE) throw new AppError('That analyzer is disabled, so its files are not accepted', 409, 'ANALYZER_DEVICE_DISABLED');

  const content = body.content;
  if (!content || content.trim() === '') throw new AppError('The file was empty', 422, 'ANALYZER_PAYLOAD_EMPTY');

  // Uploading a chemistry export to the haematology analyzer is an easy mistake,
  // and it would be stored as a parse failure with no explanation of the cause.
  const detected = detectProtocol(content);
  if (detected && detected !== device.protocol) {
    throw new AppError(
      `This file looks like ${describeProtocol(detected)}, but ${device.name} is set up for ${describeProtocol(device.protocol)}. Pick the right analyzer, or change its protocol.`,
      422,
      'ANALYZER_PROTOCOL_MISMATCH'
    );
  }

  const outcome = await ingestAnalyzerPayload({
    device,
    rawPayload: content,
    contentType: clean(body.filename) ?? 'upload',
    actorId: req.user?.id ?? null
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ANALYZER_FILE_UPLOADED',
    module: 'Lab',
    entityType: 'AnalyzerMessage',
    entityId: outcome.messageId,
    details: { deviceId: device.id, deviceName: device.name, filename: body.filename ?? null, applied: outcome.applied, skipped: outcome.skipped, status: outcome.status }
  });

  return { outcome, message: await getAnalyzerMessage(outcome.messageId) };
}

function describeProtocol(protocol: AnalyzerProtocol) {
  switch (protocol) {
    case AnalyzerProtocol.HL7_V2:
      return 'an HL7 v2 message';
    case AnalyzerProtocol.ASTM:
      return 'an ASTM message';
    case AnalyzerProtocol.CSV:
      return 'a delimited export file';
    case AnalyzerProtocol.JSON:
      return 'JSON';
    default:
      return 'something we do not recognise';
  }
}
