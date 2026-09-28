import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/appError.js';

/**
 * Multi-tenant isolation.
 *
 * Every model with a `facilityId` column is tenant-owned. Queries against those
 * models are automatically restricted to the facility of the current request,
 * and creates are stamped with it, by the Prisma extension below. The request's
 * facility lives in AsyncLocalStorage and is set by `requireAuth`.
 *
 * The extension fails closed: querying a tenant model with no facility context
 * throws, rather than silently reading every facility's rows. Code that really
 * must work across facilities (authentication lookups, platform administration,
 * seeds) opts in explicitly with `runAsSystem`.
 *
 * Enforced elsewhere: a raw foreign key in create data (for example `patientId`)
 * pointing into another facility is rejected by the database triggers generated
 * by scripts/facility-guards.ts. Raw SQL reads are never scoped, so tenant code
 * must not use `$queryRaw`.
 */

type TenantStore =
  | { kind: 'facility'; facilityId: string }
  | { kind: 'platform' }
  | { kind: 'system'; reason: string };

const storage = new AsyncLocalStorage<TenantStore>();

/**
 * Prisma queries are lazy: `prisma.x.findMany()` only runs when something calls
 * `.then()` on it. If `fn` returns an unstarted query, awaiting it later would run
 * it outside this context, so start it here, while the context is active.
 */
function runIn<T>(store: TenantStore, fn: () => T): T {
  return storage.run(store, () => {
    const result = fn();
    if (result && typeof (result as { then?: unknown }).then === 'function') {
      return (result as unknown as PromiseLike<unknown>).then((value) => value) as T;
    }
    return result;
  });
}

export function runWithFacility<T>(facilityId: string, fn: () => T): T {
  if (!facilityId) throw new AppError('A facility id is required', 500, 'TENANT_CONTEXT_INVALID');
  return runIn({ kind: 'facility', facilityId }, fn);
}

/** Platform administrators: no facility, and tenant models are off limits. */
export function runAsPlatform<T>(fn: () => T): T {
  return runIn({ kind: 'platform' }, fn);
}

/** Bypasses tenant scoping. Keep call sites few, obvious and reviewed. */
export function runAsSystem<T>(reason: string, fn: () => T): T {
  return runIn({ kind: 'system', reason }, fn);
}

export function currentFacilityId(): string | null {
  const store = storage.getStore();
  return store?.kind === 'facility' ? store.facilityId : null;
}

type RelationMap = Map<string, string>;
const tenantModels = new Set<string>();
const relationsByModel = new Map<string, RelationMap>();

for (const model of Prisma.dmmf.datamodel.models) {
  const relations: RelationMap = new Map();
  for (const field of model.fields) {
    if (field.kind === 'object') relations.set(field.name, field.type);
    if (field.name === 'facilityId') tenantModels.add(model.name);
  }
  relationsByModel.set(model.name, relations);
}

/** Log tables may be written before a facility is known (e.g. failed logins). */
const CONTEXT_OPTIONAL_WRITES = new Set(['AuditLog', 'SystemEvent', 'ApiRequestLog']);

export function isTenantModel(model: string) {
  return tenantModels.has(model);
}

type Data = Record<string, any>;
const asArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);
const isObject = (value: unknown): value is Data => typeof value === 'object' && value !== null && !Array.isArray(value);

function scopeWhere(where: Data | undefined, facilityId: string): Data {
  return { ...(where ?? {}), facilityId };
}

function rejectFacilityChange(model: string, data: Data | undefined) {
  if (data && ('facilityId' in data || 'facility' in data)) {
    throw new AppError(`${model} rows cannot be moved to another facility`, 400, 'TENANT_REASSIGNMENT_FORBIDDEN');
  }
}

/** Stamps one create payload, choosing the checked or unchecked input shape Prisma expects. */
function stampCreate(model: string, data: Data, facilityId: string): Data {
  const relations = relationsByModel.get(model)!;
  const usesRelationInputs = Object.keys(data).some((key) => relations.has(key) && key !== 'facility');
  const stamped: Data = { ...data };
  delete stamped.facilityId;
  delete stamped.facility;
  if (usesRelationInputs) stamped.facility = { connect: { id: facilityId } };
  else stamped.facilityId = facilityId;
  return stampNested(model, stamped, facilityId);
}

/** Walks nested relation writes so child rows are stamped and connects stay in-facility. */
function stampNested(model: string, data: Data, facilityId: string): Data {
  const relations = relationsByModel.get(model)!;
  for (const [key, value] of Object.entries(data)) {
    const target = relations.get(key);
    if (!target || key === 'facility' || !tenantModels.has(target) || !isObject(value)) continue;
    const ops: Data = { ...value };

    if (ops.create) {
      ops.create = Array.isArray(ops.create)
        ? ops.create.map((row: Data) => stampCreate(target, row, facilityId))
        : stampCreate(target, ops.create, facilityId);
    }
    if (ops.createMany?.data) {
      ops.createMany = {
        ...ops.createMany,
        data: asArray(ops.createMany.data).map((row: Data) => ({ ...row, facilityId }))
      };
    }
    if (ops.connect) {
      ops.connect = Array.isArray(ops.connect)
        ? ops.connect.map((where: Data) => scopeWhere(where, facilityId))
        : scopeWhere(ops.connect, facilityId);
    }
    if (ops.connectOrCreate) {
      const mapOne = (entry: Data) => ({
        where: scopeWhere(entry.where, facilityId),
        create: stampCreate(target, entry.create, facilityId)
      });
      ops.connectOrCreate = Array.isArray(ops.connectOrCreate) ? ops.connectOrCreate.map(mapOne) : mapOne(ops.connectOrCreate);
    }
    if (ops.upsert) {
      const mapOne = (entry: Data) => {
        rejectFacilityChange(target, entry.update);
        return {
          ...entry,
          ...(entry.where ? { where: scopeWhere(entry.where, facilityId) } : {}),
          create: stampCreate(target, entry.create, facilityId),
          update: stampNested(target, entry.update ?? {}, facilityId)
        };
      };
      ops.upsert = Array.isArray(ops.upsert) ? ops.upsert.map(mapOne) : mapOne(ops.upsert);
    }
    if (ops.update) {
      // To-many: { where, data } (or a list of them). To-one: the data itself, or { where?, data }.
      const mapOne = (entry: Data) => {
        const payload = isObject(entry.data) ? entry.data : entry;
        rejectFacilityChange(target, payload);
        const nested = stampNested(target, payload, facilityId);
        return isObject(entry.data) ? { ...entry, data: nested } : nested;
      };
      ops.update = Array.isArray(ops.update) ? ops.update.map(mapOne) : mapOne(ops.update);
    }
    data[key] = ops;
  }
  return data;
}

const FILTERED_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany'
]);

export function applyTenantScope(model: string, operation: string, args: Data, facilityId: string): Data {
  const scoped: Data = { ...(args ?? {}) };

  if (FILTERED_OPERATIONS.has(operation)) {
    scoped.where = scopeWhere(scoped.where, facilityId);
  }
  if (operation === 'update' || operation === 'updateMany') {
    rejectFacilityChange(model, scoped.data);
    if (operation === 'update') scoped.data = stampNested(model, { ...scoped.data }, facilityId);
  }
  if (operation === 'create') {
    scoped.data = stampCreate(model, scoped.data, facilityId);
  }
  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    scoped.data = asArray(scoped.data).map((row: Data) => ({ ...row, facilityId }));
  }
  if (operation === 'upsert') {
    rejectFacilityChange(model, scoped.update);
    scoped.where = scopeWhere(scoped.where, facilityId);
    scoped.create = stampCreate(model, scoped.create, facilityId);
    scoped.update = stampNested(model, { ...scoped.update }, facilityId);
  }
  return scoped;
}

export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!tenantModels.has(model)) return query(args);

        const store = storage.getStore();
        if (store?.kind === 'system') return query(args);
        if (store?.kind === 'facility') {
          return query(applyTenantScope(model, operation, args as Data, store.facilityId) as typeof args);
        }

        const isWrite = operation === 'create' || operation === 'createMany';
        if (isWrite && CONTEXT_OPTIONAL_WRITES.has(model)) return query(args);

        throw new AppError(
          `${model}.${operation} requires a facility context`,
          500,
          store?.kind === 'platform' ? 'TENANT_DATA_FORBIDDEN_FOR_PLATFORM' : 'TENANT_CONTEXT_MISSING'
        );
      }
    }
  }
});
