import {
  AnalyzerMessageStatus,
  CatalogItemType,
  LabResultStatus,
  LabSampleStatus,
  NotificationType,
  OrderItemStatus,
  Prisma,
  ResultFlag,
  UserRole,
  UserStatus,
  type AnalyzerDevice
} from '@prisma/client';
import { prisma } from '../prisma.service.js';
import { nextCode as issueCode } from '../codeSequence.service.js';
import { setParentOrderProgress } from '../lab.service.js';
import { computeFlag, flagFromAnalyzerMarker, numberOrNull, referenceDisplay } from '../labFlags.js';
import { createAuditLog } from '../audit.service.js';
import { AppError } from '../../utils/appError.js';
import { parseAnalyzerPayload, type AnalyzerObservation, type AnalyzerReading } from './parsers.js';

/*
  Putting an analyzer's numbers on the right patient's result.

  Three rules shape everything here, and they are the reason this is not simply
  a bulk insert:

  1. Nothing is ever released by a machine. Results land as a draft on the bench,
     or at most in the review queue. A person signs off, always.
  2. Nothing is ever guessed. An analyzer code this facility has not mapped, a
     specimen id that matches no sample, a test that is not on the order — each
     is set aside with a reason someone can read and act on, never approximated.
  3. Nothing is ever lost. The payload is stored verbatim before we try to
     understand it, so a message can be replayed once a mapping is fixed.
*/

/** One observation, resolved to the field it belongs in. */
type Resolution = {
  observation: AnalyzerObservation;
  catalogItemId: string;
  referenceParameterId: string | null;
  /** The field name we store it under: ours when mapped, the analyzer's when not. */
  name: string;
  unitOverride: string | null;
  factor: number | null;
  mapped: boolean;
};

export type AppliedResult = {
  labResultId: string;
  sampleId: string;
  resultCode: string;
  sampleCode: string;
  patientName: string;
  testName: string;
  parameters: number;
  criticalParameters: string[];
};

export type IngestOutcome = {
  messageId: string;
  status: AnalyzerMessageStatus;
  applied: number;
  skipped: number;
  /** Why a reading or observation was set aside, in words the bench can act on. */
  notes: string[];
  error: string | null;
  results: AppliedResult[];
};

const sampleForIngestInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
  orderItem: {
    include: {
      catalogItem: { include: { parameters: { include: { ranges: true }, orderBy: { sortOrder: 'asc' as const } } } },
      order: { select: { id: true, orderCode: true } }
    }
  }
} satisfies Prisma.LabSampleInclude;

type SampleForIngest = Prisma.LabSampleGetPayload<{ include: typeof sampleForIngestInclude }>;

/* ------------------------------------------------------------- the entry -- */

/**
 * Store what an analyzer sent, then try to apply it. The message row is written
 * first and committed on its own, so a payload is never lost to a failure in the
 * processing that follows.
 */
export async function ingestAnalyzerPayload(options: {
  device: AnalyzerDevice;
  rawPayload: string;
  contentType?: string | null;
  /** Set when a person uploaded the file by hand rather than a device sending it. */
  actorId?: string | null;
}): Promise<IngestOutcome> {
  const { device, rawPayload, contentType, actorId } = options;

  const message = await prisma.analyzerMessage.create({
    data: {
      deviceId: device.id,
      rawPayload,
      contentType: contentType ?? null,
      status: AnalyzerMessageStatus.RECEIVED
    }
  });
  await prisma.analyzerDevice.update({
    where: { id: device.id },
    data: { lastMessageAt: new Date(), apiKeyLastUsedAt: actorId ? undefined : new Date() }
  });

  return applyAnalyzerMessage(message.id, device, actorId ?? null);
}

/**
 * Parse and apply a stored message. Replay calls this again after a mapping is
 * fixed, which is why it reads the payload back from the row rather than taking it.
 */
export async function applyAnalyzerMessage(messageId: string, device: AnalyzerDevice, actorId: string | null): Promise<IngestOutcome> {
  const message = await prisma.analyzerMessage.findUniqueOrThrow({ where: { id: messageId } });
  const notes: string[] = [];
  const results: AppliedResult[] = [];
  let applied = 0;
  let skipped = 0;

  let readings: AnalyzerReading[];
  try {
    readings = parseAnalyzerPayload(device.protocol, message.rawPayload).readings;
  } catch (error) {
    const reason = error instanceof AppError ? error.message : 'The payload could not be read';
    await prisma.analyzerMessage.update({
      where: { id: messageId },
      data: { status: AnalyzerMessageStatus.FAILED, error: reason, processedAt: new Date(), parsed: Prisma.DbNull }
    });
    return { messageId, status: AnalyzerMessageStatus.FAILED, applied: 0, skipped: 0, notes: [], error: reason, results: [] };
  }

  const firstSampleId = readings.find((reading) => reading.sampleId)?.sampleId ?? null;

  for (const reading of readings) {
    const outcome = await applyReading(reading, device, actorId);
    applied += outcome.applied;
    skipped += outcome.skipped;
    notes.push(...outcome.notes);
    results.push(...outcome.results);
  }

  const status = applied > 0 && skipped === 0
    ? AnalyzerMessageStatus.APPLIED
    : applied > 0
      ? AnalyzerMessageStatus.PARTIAL
      : AnalyzerMessageStatus.UNMATCHED;

  await prisma.analyzerMessage.update({
    where: { id: messageId },
    data: {
      status,
      parsed: readings as unknown as Prisma.InputJsonValue,
      analyzerSampleId: firstSampleId,
      // A message usually covers one specimen; when it covers several, no single
      // sample or result is the right thing to point at.
      sampleId: results.length === 1 ? results[0].sampleId : null,
      labResultId: results.length === 1 ? results[0].labResultId : null,
      appliedCount: applied,
      skippedCount: skipped,
      error: notes.length ? notes.join(' ') : null,
      processedAt: new Date()
    }
  });

  await notifyCriticalValues(results, device, actorId);

  return { messageId, status, applied, skipped, notes, error: null, results };
}

/* ---------------------------------------------------------- one specimen -- */

async function applyReading(reading: AnalyzerReading, device: AnalyzerDevice, actorId: string | null) {
  const notes: string[] = [];
  const results: AppliedResult[] = [];
  let applied = 0;
  let skipped = 0;

  if (!reading.sampleId) {
    return { applied: 0, skipped: reading.observations.length, notes: ['A result arrived with no specimen id on it, so there is no way to tell whose it is.'], results };
  }
  if (reading.observations.length === 0) {
    return { applied: 0, skipped: 0, notes: [`${reading.sampleId} carried no results.`], results };
  }

  const sample = await findSample(reading.sampleId);
  if (!sample) {
    return {
      applied: 0,
      skipped: reading.observations.length,
      notes: [`No accepted sample matches "${reading.sampleId}". Check the barcode on the tube, or accept the sample first.`],
      results
    };
  }
  if (([LabSampleStatus.REJECTED, LabSampleStatus.RECOLLECTION_REQUESTED] as LabSampleStatus[]).includes(sample.status)) {
    return { applied: 0, skipped: reading.observations.length, notes: [`${sample.sampleCode} was rejected, so results for it were not stored.`], results };
  }
  if (sample.orderItem.type !== CatalogItemType.LAB) {
    return { applied: 0, skipped: reading.observations.length, notes: [`${sample.sampleCode} is not a laboratory test.`], results };
  }
  // The analyzer's own patient id is advisory, but a mismatch is worth saying out
  // loud: it usually means the wrong barcode went on the tube.
  if (reading.patientId && !patientIdLooksRight(reading.patientId, sample)) {
    notes.push(`${sample.sampleCode} is ${sample.patient.patientCode} here, but the analyzer called the patient "${reading.patientId}". The values were stored; please confirm the tube was labelled correctly.`);
  }

  const maps = await loadTestMaps(device.id);
  const resolutions: Resolution[] = [];
  for (const observation of reading.observations) {
    if (observation.value.trim() === '') {
      skipped += 1;
      notes.push(`${observation.code} on ${sample.sampleCode} came through with no value.`);
      continue;
    }
    const resolution = resolveObservation(observation, sample, maps, device);
    if (!resolution) {
      skipped += 1;
      notes.push(`"${observation.code}" is not mapped to a test, so its value was not stored. Map it under Analyzers → Test mapping, then replay this message.`);
      continue;
    }
    resolutions.push(resolution);
  }

  // One analyzer run can cover several of our tests when a panel was ordered as
  // separate items, so group by the test each value belongs to.
  const byCatalogItem = new Map<string, Resolution[]>();
  for (const resolution of resolutions) {
    const list = byCatalogItem.get(resolution.catalogItemId) ?? [];
    list.push(resolution);
    byCatalogItem.set(resolution.catalogItemId, list);
  }

  for (const [catalogItemId, group] of byCatalogItem) {
    const target = catalogItemId === sample.orderItem.catalogItemId ? sample : await findSiblingSample(sample.orderItem.orderId, catalogItemId);
    if (!target) {
      skipped += group.length;
      const testName = group[0].mapped ? await catalogItemName(catalogItemId) : group[0].name;
      notes.push(`${group.length} value(s) map to "${testName}", which was not ordered for ${sample.patient.patientCode} on ${sample.orderItem.order.orderCode}.`);
      continue;
    }
    if (([LabSampleStatus.REJECTED, LabSampleStatus.RECOLLECTION_REQUESTED] as LabSampleStatus[]).includes(target.status)) {
      skipped += group.length;
      notes.push(`${target.sampleCode} was rejected, so its results were not stored.`);
      continue;
    }

    const outcome = await writeResult(target, group, device, actorId);
    if (outcome.skippedReason) {
      skipped += group.length;
      notes.push(outcome.skippedReason);
      continue;
    }
    applied += outcome.applied!.parameters;
    results.push(outcome.applied!);
  }

  return { applied, skipped, notes, results };
}

/* ----------------------------------------------------------- the writing -- */

async function writeResult(sample: SampleForIngest, group: Resolution[], device: AnalyzerDevice, actorId: string | null) {
  const existing = await prisma.labResult.findFirst({
    where: { orderItemId: sample.orderItemId },
    orderBy: { createdAt: 'desc' },
    include: { parameters: true }
  });

  // A sent result is not overwritten in place. Withdrawing it first is a
  // deliberate, audited act by a person — see reverseLabResult.
  if (existing && ([LabResultStatus.SIGNED_OFF, LabResultStatus.AMENDED] as LabResultStatus[]).includes(existing.status)) {
    return {
      skippedReason: `${existing.resultCode} for ${sample.sampleCode} has already been signed off and sent. Withdraw it from Lab Results before the analyzer value can replace it.`,
      applied: null as AppliedResult | null
    };
  }
  if (existing && existing.status === LabResultStatus.CANCELLED) {
    return { skippedReason: `${existing.resultCode} for ${sample.sampleCode} was cancelled, so the analyzer value was not stored.`, applied: null as AppliedResult | null };
  }

  const parameters = sample.orderItem.catalogItem.parameters;
  const rows = group.map((resolution) => buildParameterRow(resolution, parameters));
  const criticalParameters = rows.filter((row) => row.flag === ResultFlag.CRITICAL).map((row) => row.name);
  const status = device.autoSubmitForReview ? LabResultStatus.PENDING_REVIEW : LabResultStatus.DRAFT;

  const saved = await prisma.$transaction(async (tx) => {
    const result = existing
      ? await tx.labResult.update({
          where: { id: existing.id },
          data: {
            status,
            submittedAt: status === LabResultStatus.PENDING_REVIEW ? new Date() : existing.submittedAt,
            analyzerDeviceId: device.id,
            analyzerUsed: device.name
          }
        })
      : await tx.labResult.create({
          data: {
            resultCode: await issueCode(tx, 'RES'),
            orderItemId: sample.orderItemId,
            sampleId: sample.id,
            patientId: sample.patientId,
            status,
            submittedAt: status === LabResultStatus.PENDING_REVIEW ? new Date() : null,
            analyzerDeviceId: device.id,
            analyzerUsed: device.name,
            // No person entered these, and recording one as if they had would be a
            // false attribution on a clinical record.
            enteredById: null
          }
        });

    /*
      Values already on the result are replaced only where the analyzer sent that
      same field. Anything a technician typed that the instrument does not
      measure — a comment, a manual differential — is left exactly as it is.
    */
    for (const row of rows) {
      const match = existing?.parameters.find((parameter) => parameter.name.toLowerCase() === row.name.toLowerCase());
      if (match) await tx.labResultParameter.update({ where: { id: match.id }, data: row });
      else await tx.labResultParameter.create({ data: { ...row, labResultId: result.id } });
    }

    await tx.labSample.update({
      where: { id: sample.id },
      data: { status: status === LabResultStatus.PENDING_REVIEW ? LabSampleStatus.PENDING_REVIEW : LabSampleStatus.DRAFT }
    });
    await tx.orderItem.update({
      where: { id: sample.orderItemId },
      data: { status: status === LabResultStatus.PENDING_REVIEW ? OrderItemStatus.PENDING_REVIEW : OrderItemStatus.DRAFT }
    });
    if (status === LabResultStatus.PENDING_REVIEW) {
      await tx.labResultReview.create({
        data: { labResultId: result.id, reviewerId: null, decision: 'PENDING_REVIEW', note: `Sent for review automatically by ${device.name}.` }
      });
    }
    await setParentOrderProgress(sample.orderItem.orderId, tx, actorId);
    return result;
  });

  await createAuditLog({
    actorId,
    action: 'LAB_RESULT_RECEIVED_FROM_ANALYZER',
    module: 'Lab',
    entityType: 'LabResult',
    entityId: saved.id,
    afterData: { status, parameters: rows.map((row) => ({ name: row.name, value: row.value, flag: row.flag, analyzerCode: row.analyzerCode })) },
    details: {
      deviceId: device.id,
      deviceCode: device.deviceCode,
      deviceName: device.name,
      sampleCode: sample.sampleCode,
      unmappedStored: rows.filter((row) => !row.referenceParameterId).length,
      criticalParameters
    }
  });

  return {
    skippedReason: null as string | null,
    applied: {
      labResultId: saved.id,
      sampleId: sample.id,
      resultCode: saved.resultCode,
      sampleCode: sample.sampleCode,
      patientName: `${sample.patient.firstName} ${sample.patient.lastName}`.trim(),
      testName: sample.orderItem.catalogItem.name,
      parameters: rows.length,
      criticalParameters
    }
  };
}

type ParameterRow = Omit<Prisma.LabResultParameterUncheckedCreateInput, 'labResultId' | 'id' | 'facilityId'>;

function buildParameterRow(resolution: Resolution, parameters: SampleForIngest['orderItem']['catalogItem']['parameters']): ParameterRow {
  const { observation } = resolution;
  const reference = resolution.referenceParameterId ? parameters.find((parameter) => parameter.id === resolution.referenceParameterId) ?? null : null;
  const range = reference?.ranges[0] ?? null;

  // A factor converts the instrument's unit to ours. The untouched reading is
  // kept alongside, so the conversion can always be checked.
  const raw = observation.value.trim();
  const rawNumber = numberOrNull(raw);
  const converted = resolution.factor !== null && rawNumber !== null ? rawNumber * resolution.factor : null;
  const value = converted === null ? raw : String(Number(converted.toPrecision(12)));

  const ourFlag = computeFlag(value, range);
  // Our ranges decide. The analyzer's own marker is read only where we have no
  // range of our own, so a value is never left unflagged when the instrument knew.
  const flag = ourFlag === ResultFlag.NO_RANGE ? flagFromAnalyzerMarker(observation.abnormalFlag) ?? ResultFlag.NO_RANGE : ourFlag;

  const measuredAt = observation.measuredAt ? new Date(observation.measuredAt) : null;

  return {
    referenceParameterId: resolution.referenceParameterId,
    name: reference?.name ?? resolution.name,
    value,
    numericValue: numberOrNull(value),
    unit: resolution.unitOverride ?? reference?.unit ?? observation.unit ?? null,
    referenceRange: (reference ? referenceDisplay(reference) : null) ?? observation.referenceRange ?? null,
    low: range?.low ?? null,
    high: range?.high ?? null,
    criticalLow: range?.criticalLow ?? null,
    criticalHigh: range?.criticalHigh ?? null,
    flag,
    source: 'ANALYZER',
    analyzerCode: observation.code,
    analyzerRawValue: raw,
    measuredAt: measuredAt && !Number.isNaN(measuredAt.getTime()) ? measuredAt : null
  };
}

/* ------------------------------------------------------------- resolving -- */

type TestMap = Prisma.AnalyzerTestMapGetPayload<{ include: { referenceParameter: true } }>;

async function loadTestMaps(deviceId: string) {
  // Both this analyzer's own mappings and the facility-wide ones.
  return prisma.analyzerTestMap.findMany({
    where: { isActive: true, OR: [{ deviceId }, { deviceId: null }] },
    include: { referenceParameter: true }
  });
}

function resolveObservation(observation: AnalyzerObservation, sample: SampleForIngest, maps: TestMap[], device: AnalyzerDevice): Resolution | null {
  const code = observation.code.trim().toLowerCase();

  // A mapping for this instrument wins over a facility-wide one.
  const candidates = maps.filter((map) => map.analyzerCode.trim().toLowerCase() === code);
  const map = candidates.find((candidate) => candidate.deviceId === device.id) ?? candidates.find((candidate) => candidate.deviceId === null);
  if (map) {
    return {
      observation,
      catalogItemId: map.catalogItemId,
      referenceParameterId: map.referenceParameterId,
      name: map.referenceParameter?.name ?? observation.label ?? observation.code,
      unitOverride: map.unitOverride,
      factor: map.factor === null ? null : Number(map.factor),
      mapped: true
    };
  }

  /*
    No mapping, so fall back to this test's own parameter names. An instrument
    that calls a field exactly what we call it needs no setting up, which is what
    makes the common case work on day one.
  */
  const parameters = sample.orderItem.catalogItem.parameters;
  const byName = parameters.find((parameter) => {
    const name = parameter.name.trim().toLowerCase();
    return name === code || (observation.label ? name === observation.label.trim().toLowerCase() : false);
  });
  if (byName) {
    return { observation, catalogItemId: sample.orderItem.catalogItemId, referenceParameterId: byName.id, name: byName.name, unitOverride: null, factor: null, mapped: false };
  }

  // A single-parameter test, where the instrument's code is the test's own code
  // or name, needs no mapping either.
  if (parameters.length === 1) {
    const item = sample.orderItem.catalogItem;
    if ([item.catalogCode, item.name, ...item.aliases].some((alias) => alias.trim().toLowerCase() === code)) {
      return { observation, catalogItemId: item.id, referenceParameterId: parameters[0].id, name: parameters[0].name, unitOverride: null, factor: null, mapped: false };
    }
  }

  /*
    Last resort, and only if the facility asked for it: store the value under the
    analyzer's own name, with no reference range. Off by default, because a value
    with no range cannot be flagged, and an unflagged number on a report is worse
    than a value the bench was told to map.
  */
  if (device.acceptUnmappedTests) {
    return {
      observation,
      catalogItemId: sample.orderItem.catalogItemId,
      referenceParameterId: null,
      name: observation.label ?? observation.code,
      unitOverride: null,
      factor: null,
      mapped: false
    };
  }

  return null;
}

/* --------------------------------------------------------------- lookups -- */

async function findSample(analyzerSampleId: string) {
  const needle = analyzerSampleId.trim();
  // The specimen id is usually our sample code, printed on the tube barcode, but
  // some labs stick their own barcode on and record it against the sample.
  const sample = await prisma.labSample.findFirst({
    where: { OR: [{ sampleCode: { equals: needle, mode: 'insensitive' } }, { barcodeValue: { equals: needle, mode: 'insensitive' } }] },
    include: sampleForIngestInclude,
    orderBy: { createdAt: 'desc' }
  });
  return sample;
}

async function findSiblingSample(orderId: string, catalogItemId: string) {
  // An order holds each catalog item at most once, so this is unambiguous.
  return prisma.labSample.findFirst({
    where: { orderItem: { orderId, catalogItemId } },
    include: sampleForIngestInclude
  });
}

async function catalogItemName(catalogItemId: string) {
  const item = await prisma.catalogItem.findUnique({ where: { id: catalogItemId }, select: { name: true } });
  return item?.name ?? 'another test';
}

function patientIdLooksRight(analyzerPatientId: string, sample: SampleForIngest) {
  const needle = analyzerPatientId.trim().toLowerCase();
  const patient = sample.patient;
  return [patient.patientCode, patient.id].some((candidate) => candidate.toLowerCase() === needle);
}

/* --------------------------------------------------------------- alerting -- */

/**
 * A critical value that arrives on its own, with nobody watching the screen, is
 * the real risk in letting a machine file results. The bench is told at once,
 * while the result is still a draft nobody outside the lab can see.
 */
async function notifyCriticalValues(results: AppliedResult[], device: AnalyzerDevice, actorId: string | null) {
  const critical = results.filter((result) => result.criticalParameters.length > 0);
  if (critical.length === 0) return;

  const labUsers = await prisma.user.findMany({
    where: { role: { in: [UserRole.LAB_STAFF, UserRole.ADMIN] }, status: UserStatus.ACTIVE },
    select: { id: true }
  });
  if (labUsers.length === 0) return;

  await prisma.notification.createMany({
    data: critical.flatMap((result) => labUsers.map((user) => ({
      recipientUserId: user.id,
      createdById: actorId,
      type: NotificationType.ORDER_UPDATE,
      title: `Critical value from ${device.name}`,
      body: `${result.patientName} (${result.sampleCode}, ${result.testName}): ${result.criticalParameters.join(', ')} came back critical on ${device.name}. The result is a draft awaiting your check.`
    })))
  });
}
