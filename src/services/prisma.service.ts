import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { isDevelopment } from '../config/env.js';
import { tenantExtension } from './tenantContext.js';
import { accessCacheExtension } from './accessCache.js';

declare global {
  var __diagnosisCenterPrisma: PrismaClient | undefined;
}

// The tenant extension only rewrites query arguments at runtime, so the client
// keeps the plain PrismaClient type and every existing call site stays valid.
function createPrismaClient() {
  // Prisma 7 talks to Postgres through node-postgres; this is the pooled address.
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: isDevelopment ? ['query', 'warn', 'error'] : ['warn', 'error']
  })
    .$extends(tenantExtension)
    .$extends(accessCacheExtension) as unknown as PrismaClient;
}

export const prisma = globalThis.__diagnosisCenterPrisma ?? createPrismaClient();

if (isDevelopment) {
  globalThis.__diagnosisCenterPrisma = prisma;
}

export async function connectDatabase() {
  await prisma.$connect();
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}

export async function checkDatabaseConnection() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      status: 'connected',
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      status: 'disconnected',
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
