import { PrismaClient } from '@prisma/client';
import { isDevelopment } from '../config/env.js';

declare global {
  var __diagnosisCenterPrisma: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient({
    log: isDevelopment ? ['query', 'warn', 'error'] : ['warn', 'error']
  });
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
