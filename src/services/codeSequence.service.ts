import type { Prisma, PrismaClient } from '@prisma/client';
import { currentFacilityId } from './tenantContext.js';
import { AppError } from '../utils/appError.js';

/*
  Human-readable codes (PAT-0001, ORD-2026-0001, INV-0001, ...), unique per facility.

  Codes used to be "count the rows, add one", which hands the same code to two
  requests that arrive together; one of them then fails on the unique index.
  Here each series has a counter row in FacilitySequence that is incremented
  with INSERT ... ON CONFLICT DO UPDATE, which takes a row lock: concurrent
  transactions queue on it and receive consecutive values. The counter never
  falls behind the highest code already stored (seeded data, or codes written
  before this existed), so it can be introduced on a live database.

  This is one of the few places that uses raw SQL, so it passes facilityId
  explicitly; it must run inside a facility context.
*/

type SeriesConfig = { table: string; column: string; yearly?: boolean };

export const CODE_SERIES = {
  PAT: { table: 'Patient', column: 'patientCode' },
  ORD: { table: 'Order', column: 'orderCode', yearly: true },
  INV: { table: 'Invoice', column: 'invoiceCode' },
  VIS: { table: 'PatientVisit', column: 'visitCode' },
  APT: { table: 'Appointment', column: 'appointmentCode' },
  PAY: { table: 'Payment', column: 'paymentCode' },
  RCPT: { table: 'Receipt', column: 'receiptCode' },
  LED: { table: 'LedgerEntry', column: 'entryCode' },
  SHIFT: { table: 'CashierShift', column: 'shiftCode' },
  EXP: { table: 'Expense', column: 'expenseCode' },
  SMP: { table: 'LabSample', column: 'sampleCode' },
  RES: { table: 'LabResult', column: 'resultCode' },
  RPT: { table: 'Report', column: 'reportCode' },
  'LAB-INV': { table: 'InventoryItem', column: 'itemCode' },
  'SCN-BKG': { table: 'ScanBooking', column: 'bookingCode' },
  'SCN-RES': { table: 'ScanResult', column: 'resultCode' },
  ENC: { table: 'Encounter', column: 'encounterCode', yearly: true },
  RX: { table: 'Prescription', column: 'prescriptionCode', yearly: true },
  DSP: { table: 'Dispensation', column: 'dispensationCode', yearly: true },
  ADM: { table: 'Admission', column: 'admissionCode', yearly: true },
  SRG: { table: 'Surgery', column: 'surgeryCode', yearly: true }
} satisfies Record<string, SeriesConfig>;

export type CodeSeries = keyof typeof CODE_SERIES;

type Client = Prisma.TransactionClient | PrismaClient;

/** The next code in a series for the current facility. Use inside the transaction that stores it. */
export async function nextCode(client: Client, series: CodeSeries): Promise<string> {
  const facilityId = currentFacilityId();
  if (!facilityId) throw new AppError('Codes can only be issued inside a facility', 500, 'TENANT_CONTEXT_MISSING');

  const config: SeriesConfig = CODE_SERIES[series];
  const prefix = config.yearly ? `${series}-${new Date().getUTCFullYear()}-` : `${series}-`;

  // Only codes that are exactly the prefix followed by digits count (so "PAT-RX-12" is not
  // read as patient 12). Table and column names come from the fixed map above, never from input.
  const [{ highest }] = await client.$queryRawUnsafe<Array<{ highest: number }>>(
    `SELECT COALESCE(MAX(CAST(substring("${config.column}" from $3::int) AS integer)), 0)::int AS highest
       FROM "${config.table}"
      WHERE "facilityId" = $1 AND "${config.column}" LIKE $2 AND substring("${config.column}" from $3::int) ~ '^[0-9]{1,9}$'`,
    facilityId,
    `${prefix}%`,
    prefix.length + 1
  );

  const [{ value }] = await client.$queryRawUnsafe<Array<{ value: number }>>(
    `INSERT INTO "FacilitySequence" ("facilityId", "name", "value", "updatedAt")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT ("facilityId", "name")
     DO UPDATE SET "value" = GREATEST("FacilitySequence"."value" + 1, EXCLUDED."value"), "updatedAt" = CURRENT_TIMESTAMP
     RETURNING "value"`,
    facilityId,
    prefix,
    highest + 1
  );

  return `${prefix}${String(value).padStart(4, '0')}`;
}
