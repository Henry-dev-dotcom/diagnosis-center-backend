import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'src/routes/labWorkflow.routes.ts',
  'src/routes/scanWorkflow.routes.ts',
  'src/routes/receptionWorkflow.routes.ts',
  'src/routes/clinicianResultDelivery.routes.ts',
  'src/routes/facilityManagement.routes.ts',
  'src/routes/workflowTracking.routes.ts',
  'src/routes/resultDocument.routes.ts',
  'src/routes/diagnosticPlatform.routes.ts',
  'src/routes/workflowReadiness.routes.ts',
  'src/controllers/workflowReadiness.controller.ts',
  'src/services/workflowReadiness.service.ts',
  'src/constants/phase14WorkflowManifest.constants.ts',
];

const expectedRouteStrings = [
  '/queue',
  '/accepted-samples',
  '/results',
  '/accepted',
  '/reception/walk-ins',
  '/clinician/results',
  '/admin/facilities',
  '/admin/workflow-events',
  '/admin/workflow-readiness',
  '/accepted-samples/:sampleId/tests/:testId/documents',
  '/accepted/:scanId/documents',
];

const missingFiles = requiredFiles.filter((file) => !existsSync(join(root, file)));

const allRouteText = requiredFiles
  .filter((file) => existsSync(join(root, file)) && file.includes('routes'))
  .map((file) => readFileSync(join(root, file), 'utf8'))
  .join('\n');

const missingRouteStrings = expectedRouteStrings.filter((route) => !allRouteText.includes(route));

if (missingFiles.length > 0 || missingRouteStrings.length > 0) {
  console.error('Phase 14 route integrity check failed.');
  if (missingFiles.length > 0) {
    console.error('\nMissing files:');
    for (const file of missingFiles) console.error(`- ${file}`);
  }
  if (missingRouteStrings.length > 0) {
    console.error('\nMissing expected route strings:');
    for (const route of missingRouteStrings) console.error(`- ${route}`);
  }
  process.exit(1);
}

console.log('Phase 14 route integrity check passed.');
console.log(`Checked ${requiredFiles.length} files and ${expectedRouteStrings.length} route patterns.`);
