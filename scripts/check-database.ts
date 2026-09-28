import { getDatabaseSummary } from '../src/services/database.service.js';
import { checkDatabaseConnection, disconnectDatabase } from '../src/services/prisma.service.js';
import { runAsSystem } from '../src/services/tenantContext.js';

const connection = await checkDatabaseConnection();
console.log('Database connection:', connection);

if (connection.ok) {
  // Operator tool: totals across every facility.
  const summary = await runAsSystem('ops.db-status', () => getDatabaseSummary());
  console.log('Database summary:', summary);
}

await disconnectDatabase();
