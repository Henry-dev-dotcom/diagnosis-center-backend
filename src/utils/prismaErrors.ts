import { Prisma } from '@prisma/client';

/*
  Which columns a unique-constraint failure (P2002) was about.

  Through a driver adapter (Prisma 7, @prisma/adapter-pg) the error no longer
  carries meta.target. Postgres reports the constraint instead, either as its
  name (e.g. "DeceasedRecord_facilityId_bodyTag_key") or as the columns, under
  meta.driverAdapterError.cause.constraint. Returns the column names when they
  are known, otherwise the constraint name as a single entry, otherwise [].
*/
export function uniqueTarget(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return [];
  const meta = (error.meta ?? {}) as {
    target?: unknown;
    driverAdapterError?: { cause?: { constraint?: { fields?: string[]; index?: string } } };
  };
  if (Array.isArray(meta.target)) return meta.target.map(String);
  if (typeof meta.target === 'string') return [meta.target];
  const constraint = meta.driverAdapterError?.cause?.constraint;
  if (constraint?.fields?.length) return constraint.fields.map((field) => field.replace(/^"|"$/g, ''));
  if (constraint?.index) return [constraint.index];
  return [];
}
