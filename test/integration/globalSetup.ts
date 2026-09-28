import { execSync } from 'node:child_process';

// Rebuilds the test database from the migrations, then seeds two facilities
// with the same demo data so every isolation test has a realistic neighbour.
export default function setup() {
  const run = (command: string) => execSync(command, { stdio: 'inherit', env: process.env });
  run('npx prisma migrate reset --force --skip-seed --skip-generate');
  run('npx tsx test/integration/seedTwoFacilities.ts');
}
