import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import type { ModuleKey } from '../config/modules.js';
import { ttlCache } from '../utils/ttlCache.js';
import { currentFacilityId } from './tenantContext.js';

/*
  Every request checks its facility's departments and subscription state.
  Both change rarely, so they are cached per facility for ACCESS_CACHE_TTL_MS
  (default 5 s). Any write to FacilityModule or Subscription clears that
  facility's entry in this process at once (the extension below); other
  processes see the change within the TTL.
*/

export type SubscriptionState = {
  status: string;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  readOnly: boolean;
} | null;

export const modulesCache = ttlCache<ModuleKey[]>(() => env.ACCESS_CACHE_TTL_MS);
export const subscriptionCache = ttlCache<SubscriptionState>(() => env.ACCESS_CACHE_TTL_MS);

const WRITES = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

function clearing(cache: { invalidate: (key?: string | null) => void }) {
  return async ({ operation, args, query }: { operation: string; args: unknown; query: (args: unknown) => Promise<unknown> }) => {
    const result = await query(args);
    // Without a facility context (system jobs), clear every facility's entry.
    if (WRITES.has(operation)) cache.invalidate(currentFacilityId() ?? undefined);
    return result;
  };
}

export const accessCacheExtension = Prisma.defineExtension({
  name: 'access-cache',
  query: {
    facilityModule: { $allOperations: clearing(modulesCache) },
    subscription: { $allOperations: clearing(subscriptionCache) }
  }
});
