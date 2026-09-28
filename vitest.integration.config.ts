import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

// Integration tests run against a real PostgreSQL database that globalSetup
// wipes and rebuilds, so it must never be the development database.
dotenv.config();
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('Set TEST_DATABASE_URL (see .env.example) to run integration tests.');
}
if (!/test/i.test(new URL(testDatabaseUrl).pathname)) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name contains "test".');
}

// Set here (not only in test.env) so globalSetup, which runs in this process, sees them too.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl,
  RATE_LIMIT_MAX_REQUESTS: '100000',
  AUTH_RATE_LIMIT_MAX_REQUESTS: '100000',
  ENABLE_API_DOCS: 'false'
});

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/integration/globalSetup.ts'],
    include: ['test/integration/**/*.test.ts'],
    // Files share one database; run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000
  }
});
