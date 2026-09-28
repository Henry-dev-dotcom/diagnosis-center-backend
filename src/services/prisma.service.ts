import { PrismaClient } from '@prisma/client';
import { isDevelopment } from '../config/env.js';
import { tenantExtension } from './tenantContext.js';

declare global {
  var __diagnosisCenterPrisma: PrismaClient | undefined;
}

// The tenant extension only rewrites query arguments at runtime, so the client
// keeps the plain PrismaClient type and every existing call site stays valid.
function createPrismaClient() {
  return new PrismaClient({
    log: isDevelopment ? ['query', 'warn', 'error'] : ['warn', 'error']
  }).$extends(tenantExtension) as unknown as PrismaClient;
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
