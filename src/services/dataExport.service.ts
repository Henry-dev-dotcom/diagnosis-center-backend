import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { currentFacilityId } from './tenantContext.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { AppError } from '../utils/appError.js';

/*
  Phase 7: a facility's complete data, as one JSON file, for the facility's
  own records, a move to another system, or a data subject request under
  Ghana's Data Protection Act (Act 843). Every table that belongs to the
  facility is included, read inside its tenant context (so nothing from
  another facility can appear), in pages so memory stays flat. Secrets are
  never exported: password hashes, session and link tokens, and payment
  authorisations are replaced by a marker.
*/

export const EXPORT_FORMAT_VERSION = 1;
const PAGE = 1000;
const REDACTED = '[not exported]';
const SECRET_FIELDS = new Set(['passwordHash', 'refreshToken', 'token', 'tokenHash', 'secretHash', 'gatewayAuthorizationCode', 'gatewayCustomerCode']);

type ModelInfo = { name: string; delegate: string; hasId: boolean };

/** Every model with a facilityId column, in schema order. */
export function exportableModels(): ModelInfo[] {
  return Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'facilityId' && f.kind === 'scalar'))
    .map((m) => ({ name: m.name, delegate: m.name[0].toLowerCase() + m.name.slice(1), hasId: m.fields.some((f) => f.name === 'id' && f.isId) }));
}

function redact(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[key] = SECRET_FIELDS.has(key) && value !== null ? REDACTED : value;
  return out;
}

// Decimal, Date and BigInt become plain JSON values.
const jsonValue = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value instanceof Prisma.Decimal ? value.toString() : value);

/** Streams the export as a JSON download. Runs in the facility's context. */
export async function streamFacilityExport(req: Request, res: Response) {
  const facilityId = currentFacilityId();
  if (!facilityId) throw new AppError('A facility is required', 400, 'FACILITY_REQUIRED');
  if (req.user?.support) throw new AppError('Data cannot be exported during a support session', 403, 'SUPPORT_SESSION_READ_ONLY');

  const facility = await prisma.facility.findUniqueOrThrow({ where: { id: facilityId }, select: { id: true, code: true, name: true, phone: true, email: true, address: true, createdAt: true } });
  const exportedAt = new Date();
  await createAuditLog({ ...getRequestAuditContext(req), action: 'DATA_EXPORT_STARTED', module: 'Data Protection', entityType: 'Facility', entityId: facilityId });

  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="lhims-${facility.code}-${exportedAt.toISOString().slice(0, 10)}.json"`);
  res.setHeader('cache-control', 'no-store');
  res.write(`{"formatVersion":${EXPORT_FORMAT_VERSION},"exportedAt":${JSON.stringify(exportedAt)},"facility":${JSON.stringify(facility)},"tables":{`);

  const counts: Record<string, number> = {};
  let firstTable = true;
  try {
  for (const model of exportableModels()) {
    const delegate = (prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<Record<string, unknown>[]> }>)[model.delegate];
    if (!delegate) continue;
    res.write(`${firstTable ? '' : ','}${JSON.stringify(model.name)}:[`);
    firstTable = false;
    let count = 0;
    let cursor: string | undefined;
    for (;;) {
      const rows = model.hasId
        ? await delegate.findMany({ take: PAGE, orderBy: { id: 'asc' }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
        : await delegate.findMany({});
      for (const row of rows) {
        res.write(`${count === 0 ? '' : ','}${JSON.stringify(redact(row), jsonValue)}`);
        count += 1;
      }
      if (!model.hasId || rows.length < PAGE) break;
      cursor = String(rows[rows.length - 1].id);
    }
    counts[model.name] = count;
    res.write(']');
  }
  res.write(`},"counts":${JSON.stringify(counts)}}`);
  res.end();
  } catch (error) {
    // Headers are already sent: cut the download so a partial file is never mistaken for a whole one.
    res.destroy(error instanceof Error ? error : new Error('Export failed'));
    await createAuditLog({ ...getRequestAuditContext(req), action: 'DATA_EXPORT_FAILED', module: 'Data Protection', entityType: 'Facility', entityId: facilityId, details: { message: error instanceof Error ? error.message : 'unknown' } });
    return;
  }
  await createAuditLog({ ...getRequestAuditContext(req), action: 'DATA_EXPORTED', module: 'Data Protection', entityType: 'Facility', entityId: facilityId, details: { tables: Object.keys(counts).length, rows: Object.values(counts).reduce((a, b) => a + b, 0) } });
}
