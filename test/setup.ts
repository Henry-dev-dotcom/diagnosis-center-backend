// Global test setup. Runs before any test module is imported.
//
// The token and env modules validate process.env at import time, so the
// required variables must exist before those modules load. We set conservative,
// non-production values here. NODE_ENV stays 'test' so the production secret
// guards in env.ts do not fire for the general suites (a dedicated test in
// env.guard.test.ts exercises those guards explicitly in a child process).

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/testdb';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-value-1234567890';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-value-0987654321';
process.env.ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN ?? '15m';
process.env.REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN ?? '7d';
