import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 reads connection settings from here, not from schema.prisma.
//
// The CLI (migrate deploy, migrate reset, migrate diff) connects with this url.
// Migrations cannot run through a connection pooler: they take advisory locks
// and issue DDL that pgbouncer in transaction mode will not carry. Neon gives a
// pooled address (DATABASE_URL, what the running app uses through the driver
// adapter in src/services/prisma.service.ts) and a direct one (DIRECT_URL), and
// this is the direct one. Where there is no pooler, set both to the same value.
//
// Read leniently rather than with env(): `prisma generate` runs at build time,
// where no database address is needed or necessarily set.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts'
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || ''
  }
});
