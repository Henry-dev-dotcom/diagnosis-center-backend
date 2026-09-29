// Writes the API reference (generated from the live routes) to docs/openapi.json.
import { writeFileSync } from 'node:fs';
import { buildOpenApiDocument } from '../src/config/openapi.js';
import { apiRouter } from '../src/routes/index.js';

const doc = buildOpenApiDocument(apiRouter);
writeFileSync('docs/openapi.json', `${JSON.stringify(doc, null, 2)}\n`);
console.log(`docs/openapi.json: ${Object.keys(doc.paths).length} paths, ${doc.tags.length} sections`);
process.exit(0);
