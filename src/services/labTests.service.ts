import type { Request } from 'express';
import { CatalogItemType, DepartmentType, GenderRule, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { roleCanViewPrices } from '../config/permissions.js';
import { AppError } from '../utils/appError.js';

/*
  The laboratory's test menu: the procedures themselves (name, sample, turnaround),
  the parameters each reports and the reference ranges behind the flags - not any
  patient's results. Lab staff maintain it; billing still owns the price.

  A test with no price is saved inactive, so nothing can be ordered (and invoiced
  at zero) before billing has priced it. A test that has ever been ordered,
  invoiced, reported or mapped to an analyzer is retired (inactive) rather than
  deleted, so history keeps its meaning.
*/

const testInclude = {
  parameters: {
    include: { ranges: { orderBy: [{ gender: 'asc' as const }, { ageMin: 'asc' as const }] } },
    orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }]
  },
  _count: { select: { orderItems: true, invoiceItems: true, analyzerMaps: true } }
} satisfies Prisma.CatalogItemInclude;

export type RangeInput = {
  gender: GenderRule;
  ageMin: number;
  ageMax: number;
  low?: number | null;
  high?: number | null;
  criticalLow?: number | null;
  criticalHigh?: number | null;
  displayRange?: string | null;
};
export type ParameterInput = { id?: string; name: string; unit?: string | null; methodNote?: string | null; ranges: RangeInput[] };

async function audit(req: Request, action: string, entityId: string, beforeData: unknown, afterData: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Laboratory', entityType: 'CatalogItem', entityId, beforeData, afterData });
}

/** Prices are not the lab's to see; strip them unless the role may view prices. */
function present<T extends { price?: unknown }>(item: T, req: Request) {
  if (req.user && roleCanViewPrices(req.user.role)) return item;
  const { price: _price, ...rest } = item;
  return { ...rest, priced: Number(_price ?? 0) > 0 };
}

function validateRanges(name: string, ranges: RangeInput[]) {
  for (const range of ranges) {
    const bad = (message: string) => new AppError(`${name}: ${message}`, 400, 'REFERENCE_RANGE_INVALID');
    if (range.ageMin > range.ageMax) throw bad('the minimum age is above the maximum age');
    const { low, high, criticalLow, criticalHigh } = range;
    if (low != null && high != null && low > high) throw bad('the low value is above the high value');
    if (criticalLow != null && low != null && criticalLow > low) throw bad('the critical-low value must not exceed the low value');
    if (criticalHigh != null && high != null && criticalHigh < high) throw bad('the critical-high value must not be below the high value');
    if (low == null && high == null && !range.displayRange) throw bad('give a low or high limit, or the text to show');
  }
}

export async function listLabTests(query: Request['query'], req: Request) {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const items = await prisma.catalogItem.findMany({
    where: {
      type: CatalogItemType.LAB,
      ...(query.includeInactive === 'true' ? {} : { isActive: true }),
      ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { catalogCode: { contains: search, mode: 'insensitive' } }] } : {})
    },
    include: testInclude,
    orderBy: { name: 'asc' },
    take: 500
  });
  return { items: items.map((item) => present(item, req)) };
}

async function labDepartmentId() {
  const department = await prisma.department.findFirst({ where: { type: DepartmentType.LABORATORY, isActive: true }, orderBy: { createdAt: 'asc' } });
  return department?.id ?? null;
}

export async function createLabTest(
  body: { name: string; catalogCode?: string; sampleType: string; expectedCompletionHours: number; aliases: string[]; price?: number },
  req: Request
) {
  const departmentId = await labDepartmentId();
  const price = roleCanViewPrices(req.user!.role) ? body.price ?? 0 : 0;
  const catalogCode = body.catalogCode?.trim().toUpperCase() || `LAB-${randomBytes(3).toString('hex').toUpperCase()}`;
  try {
    const item = await prisma.catalogItem.create({
      data: {
        catalogCode,
        name: body.name.trim(),
        type: CatalogItemType.LAB,
        price,
        sampleType: body.sampleType.trim(),
        expectedCompletionHours: body.expectedCompletionHours,
        aliases: body.aliases,
        isActive: price > 0,
        ...(departmentId ? { department: { connect: { id: departmentId } } } : {})
      },
      include: testInclude
    });
    await audit(req, 'LAB_TEST_CREATED', item.id, null, item);
    return present(item, req);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('A test with that code already exists', 409, 'CATALOG_CODE_EXISTS');
    throw error;
  }
}

export async function updateLabTest(
  id: string,
  body: { name?: string; sampleType?: string; expectedCompletionHours?: number; aliases?: string[]; isActive?: boolean },
  req: Request
) {
  const before = await prisma.catalogItem.findFirst({ where: { id, type: CatalogItemType.LAB }, include: testInclude });
  if (!before) throw new AppError('Test not found', 404, 'LAB_TEST_NOT_FOUND');
  if (body.isActive === true && Number(before.price) <= 0) {
    throw new AppError('Billing must set a price before this test can be ordered', 409, 'LAB_TEST_NOT_PRICED');
  }
  const item = await prisma.catalogItem.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.sampleType !== undefined ? { sampleType: body.sampleType.trim() } : {}),
      ...(body.expectedCompletionHours !== undefined ? { expectedCompletionHours: body.expectedCompletionHours } : {}),
      ...(body.aliases !== undefined ? { aliases: body.aliases } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {})
    },
    include: testInclude
  });
  await audit(req, 'LAB_TEST_UPDATED', id, before, item);
  return present(item, req);
}

/** Removes a test nobody has used; retires one that has history. */
export async function removeLabTest(id: string, req: Request) {
  const test = await prisma.catalogItem.findFirst({ where: { id, type: CatalogItemType.LAB }, include: testInclude });
  if (!test) throw new AppError('Test not found', 404, 'LAB_TEST_NOT_FOUND');
  const reported = await prisma.labResultParameter.count({ where: { referenceParameterId: { in: test.parameters.map((p) => p.id) } } });
  const inUse = test._count.orderItems + test._count.invoiceItems + test._count.analyzerMaps + reported > 0;
  if (inUse) {
    const retired = await prisma.catalogItem.update({ where: { id }, data: { isActive: false }, include: testInclude });
    await audit(req, 'LAB_TEST_RETIRED', id, test, retired);
    return { removed: false, retired: true, test: present(retired, req) };
  }
  await prisma.$transaction([
    prisma.referenceRange.deleteMany({ where: { parameter: { catalogItemId: id } } }),
    prisma.referenceParameter.deleteMany({ where: { catalogItemId: id } }),
    prisma.catalogItem.delete({ where: { id } })
  ]);
  await audit(req, 'LAB_TEST_DELETED', id, test, null);
  return { removed: true, retired: false, test: null };
}

/**
 * Saves the whole parameter list of a test in one go: existing parameters (matched by id) are
 * renamed/updated, new ones created, ranges replaced. A parameter dropped from the list is
 * deleted only if no result or analyzer mapping refers to it.
 */
export async function saveTestParameters(id: string, body: { parameters: ParameterInput[] }, req: Request) {
  const test = await prisma.catalogItem.findFirst({ where: { id, type: CatalogItemType.LAB }, include: testInclude });
  if (!test) throw new AppError('Test not found', 404, 'LAB_TEST_NOT_FOUND');

  const names = body.parameters.map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw new AppError('Two parameters have the same name', 400, 'PARAMETER_NAME_DUPLICATE');
  for (const parameter of body.parameters) validateRanges(parameter.name, parameter.ranges);
  const known = new Map(test.parameters.map((p) => [p.id, p]));
  if (body.parameters.some((p) => p.id && !known.has(p.id))) throw new AppError('A parameter does not belong to this test', 400, 'PARAMETER_NOT_FOUND');

  const keptIds = new Set(body.parameters.map((p) => p.id).filter(Boolean) as string[]);
  const dropped = test.parameters.filter((p) => !keptIds.has(p.id));
  for (const parameter of dropped) {
    const [results, maps] = await Promise.all([
      prisma.labResultParameter.count({ where: { referenceParameterId: parameter.id } }),
      prisma.analyzerTestMap.count({ where: { referenceParameterId: parameter.id } })
    ]);
    if (results + maps > 0) {
      throw new AppError(`"${parameter.name}" is used by reported results or an analyzer mapping and cannot be removed`, 409, 'PARAMETER_IN_USE');
    }
  }

  await prisma.$transaction(async (tx) => {
    // Rename through a holding name first so swapping two parameters' names cannot trip the unique key.
    for (const parameter of body.parameters.filter((p) => p.id)) {
      await tx.referenceParameter.update({ where: { id: parameter.id! }, data: { name: `__tmp__${parameter.id}` } });
    }
    if (dropped.length) {
      const droppedIds = dropped.map((p) => p.id);
      await tx.referenceRange.deleteMany({ where: { parameterId: { in: droppedIds } } });
      await tx.referenceParameter.deleteMany({ where: { id: { in: droppedIds } } });
    }
    for (const [index, parameter] of body.parameters.entries()) {
      const data = { name: parameter.name.trim(), unit: parameter.unit?.trim() || null, methodNote: parameter.methodNote?.trim() || null, sortOrder: index };
      const saved = parameter.id
        ? await tx.referenceParameter.update({ where: { id: parameter.id }, data })
        : await tx.referenceParameter.create({ data: { ...data, catalogItemId: id } });
      await tx.referenceRange.deleteMany({ where: { parameterId: saved.id } });
      if (parameter.ranges.length) {
        await tx.referenceRange.createMany({
          data: parameter.ranges.map((range) => ({
            parameterId: saved.id,
            gender: range.gender,
            ageMin: range.ageMin,
            ageMax: range.ageMax,
            low: range.low ?? null,
            high: range.high ?? null,
            criticalLow: range.criticalLow ?? null,
            criticalHigh: range.criticalHigh ?? null,
            displayRange: range.displayRange?.trim() || null
          }))
        });
      }
    }
  });

  const after = await prisma.catalogItem.findUniqueOrThrow({ where: { id }, include: testInclude });
  await audit(req, 'LAB_TEST_PARAMETERS_SAVED', id, test.parameters, after.parameters);
  return present(after, req);
}
