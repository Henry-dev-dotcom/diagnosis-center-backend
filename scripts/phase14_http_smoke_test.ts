/**
 * Lightweight HTTP smoke test for the upgraded workflow routes.
 *
 * Usage:
 *   API_BASE_URL=http://localhost:4000/api \
 *   API_TOKEN=<JWT_TOKEN> \
 *   FACILITY_ID=fac_sunkwa_main \
 *   npx tsx scripts/phase14_http_smoke_test.ts
 *
 * The test checks route availability. A 401/403 means the route exists but the
 * token/role is not allowed. A 404 usually means the route was not registered.
 */

const baseUrl = process.env.API_BASE_URL || 'http://localhost:4000/api';
const token = process.env.API_TOKEN || '';
const facilityId = process.env.FACILITY_ID || '';

const checks = [
  ['GET', '/admin/workflow-readiness'],
  ['GET', '/admin/facilities'],
  ['GET', '/lab/queue/summary'],
  ['GET', '/lab/queue'],
  ['GET', '/lab/accepted-samples'],
  ['GET', '/lab/results'],
  ['GET', '/scan/queue/summary'],
  ['GET', '/scan/queue'],
  ['GET', '/scan/accepted'],
  ['GET', '/scan/results'],
  ['GET', '/reception/walk-ins'],
  ['GET', '/reception/results/reference-copies'],
  ['GET', '/clinician/results'],
  ['GET', '/admin/workflow-events'],
] as const;

async function main() {
  const failures: string[] = [];

  for (const [method, path] of checks) {
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(facilityId ? { 'x-facility-id': facilityId } : {}),
      },
    });

    const acceptable = response.status !== 404 && response.status !== 405;
    console.log(`${method} ${path} -> ${response.status} ${acceptable ? 'OK' : 'FAILED'}`);

    if (!acceptable) failures.push(`${method} ${path} returned ${response.status}`);
  }

  if (failures.length > 0) {
    console.error('\nPhase 14 HTTP smoke test failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('\nPhase 14 HTTP smoke test passed.');
  console.log('Note: 401/403 responses are acceptable for this route-registration check because they confirm the route exists behind authorization.');
}

main().catch((error) => {
  console.error('Phase 14 HTTP smoke test crashed:', error);
  process.exit(1);
});
