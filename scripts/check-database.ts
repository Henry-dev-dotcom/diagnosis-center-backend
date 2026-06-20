import { getDatabaseSummary } from '../src/services/database.service.js';
import { checkDatabaseConnection, disconnectDatabase } from '../src/services/prisma.service.js';

const connection = await checkDatabaseConnection();
console.log('Database connection:', connection);

if (connection.ok) {
  const summary = await getDatabaseSummary();
  console.log('Database summary:', summary);
}

await disconnectDatabase();
