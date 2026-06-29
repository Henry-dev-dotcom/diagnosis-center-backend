import { PrismaClient } from '@prisma/client';
import {
  PHASE14_REQUIRED_DATABASE_TABLES,
  PHASE14_WORKFLOW_CHECKLIST,
  PHASE14_WORKFLOW_ROUTES,
} from '../constants/phase14WorkflowManifest.constants';

const prisma = new PrismaClient();

type DatabaseTableCheck = {
  table: string;
  exists: boolean;
};

export class WorkflowReadinessService {
  static getRouteManifest() {
    return {
      ok: true,
      routeCount: PHASE14_WORKFLOW_ROUTES.length,
      routes: PHASE14_WORKFLOW_ROUTES,
    };
  }

  static async getDatabaseReadiness() {
    const checks: DatabaseTableCheck[] = [];

    for (const table of PHASE14_REQUIRED_DATABASE_TABLES) {
      try {
        const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
          `SELECT to_regclass($1) IS NOT NULL AS exists`,
          table,
        );
        checks.push({ table, exists: Boolean(result?.[0]?.exists) });
      } catch (_error) {
        // Some PostgreSQL installations require schema-qualified table names.
        // Try the public schema before marking the table as missing.
        try {
          const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
            `SELECT to_regclass($1) IS NOT NULL AS exists`,
            `public."${table}"`,
          );
          checks.push({ table, exists: Boolean(result?.[0]?.exists) });
        } catch {
          checks.push({ table, exists: false });
        }
      }
    }

    const missing = checks.filter((item) => !item.exists).map((item) => item.table);

    return {
      ok: missing.length === 0,
      checkedTables: checks.length,
      missingTables: missing,
      checks,
    };
  }

  static async getOverview() {
    const database = await this.getDatabaseReadiness();

    return {
      ok: database.ok,
      message: database.ok
        ? 'Backend workflow readiness checks passed.'
        : 'Backend workflow readiness checks found missing database objects. Apply all migrations from Phases 2 through 13.',
      routes: this.getRouteManifest(),
      database,
      checklist: PHASE14_WORKFLOW_CHECKLIST,
      generatedAt: new Date().toISOString(),
    };
  }
}
