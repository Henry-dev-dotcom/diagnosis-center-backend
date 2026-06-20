import { PHASE6_ROUTE_CONTRACTS } from './phase6RouteMap.js';

const methodMap = {
  GET: 'get',
  POST: 'post',
  PATCH: 'patch',
  DELETE: 'delete'
} as const;

function toOpenApiPath(path: string) {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function pathParameters(path: string) {
  const matches = [...path.matchAll(/:([A-Za-z0-9_]+)/g)];
  return matches.map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description: `${match[1]} identifier`
  }));
}

function buildPaths() {
  return PHASE6_ROUTE_CONTRACTS.reduce<Record<string, Record<string, unknown>>>((paths, contract) => {
    const openApiPath = toOpenApiPath(contract.path);
    const method = methodMap[contract.method];
    paths[openApiPath] ??= {};
    paths[openApiPath][method] = {
      tags: [contract.module],
      summary: contract.summary,
      description: [
        `Phase 6 status: ${contract.status}.`,
        contract.frontendAlias ? 'This endpoint is a frontend compatibility alias.' : null,
        contract.privacyNote ?? null
      ]
        .filter(Boolean)
        .join(' '),
      security: contract.requiredRoles === 'public' ? [] : [{ bearerAuth: [] }],
      parameters: pathParameters(contract.path),
      responses: {
        '200': { description: 'Success response using the standard API envelope' },
        '400': { description: 'Validation failed or malformed request payload' },
        '401': { description: 'Authentication required or invalid token' },
        '403': { description: 'Forbidden by role or permission policy' },
        '404': { description: 'Resource or route not found' }
      }
    };
    return paths;
  }, {});
}

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Diagnosis Center Backend API',
    version: '2.1.0',
    description: 'Backend API for the SUNKWA / Diagnosis Center platform. Production Readiness Stage adds deployment hardening, production environment guards, multi-origin CORS, liveness/readiness probes, rate limiting, Docker runtime files, and production QA checks.'
  },
  servers: [
    {
      url: 'http://localhost:5000/api',
      description: 'Local development server'
    }
  ],
  tags: [
    { name: 'System', description: 'Health, version, documentation, and database status' },
    { name: 'Access Control', description: 'Role permissions, current access summary, role matrix, and Phase 6 route contracts' },
    { name: 'Auth', description: 'Login, token refresh, logout, current user, and password changes' },
    { name: 'Patients', description: 'Patient records, trends, duplicate checks, and patient-linked orders' },
    { name: 'Doctor', description: 'Doctor profile, patient referrals, orders, results, and trends' },
    { name: 'Orders', description: 'Shared order registry, lifecycle status, cancellation, and timeline' },
    { name: 'Reception', description: 'Incoming orders, check-ins, walk-ins, appointments, visits, and result notices' },
    { name: 'Lab', description: 'Lab queue, samples, drafts, review, sign-off, reference ranges, QC, and inventory foundation' },
    { name: 'Scan', description: 'Scan queue, acceptance, bookings, reports, review, sign-off, retake, and DICOM-ready file metadata foundation' },
    { name: 'Billing', description: 'Invoices, invoice updates, receipts, refunds, and payment collection foundation' },
    { name: 'Finance', description: 'Cashier shifts, float, expenses, ledger, ageing, and analytics foundation' },
    { name: 'Admin', description: 'Users, hospitals, doctors, catalog, reference ranges, departments, equipment, and audit logs' },
    { name: 'Results', description: 'Released results, reports, release workflow, and privacy-safe delivery actions' },
    { name: 'Reports', description: 'Operational, clinical, delivery, and finance report exports' },
    { name: 'Notifications', description: 'In-app notifications and delivery retry/settings foundation' },
    { name: 'Files', description: 'Local/base64 uploads, metadata fallback, signed downloads, and DICOM-ready study metadata' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      ApiSuccess: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Request completed successfully' },
          data: { type: 'object' }
        }
      },
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed' },
          code: { type: 'string', example: 'VALIDATION_FAILED' },
          requestId: { type: 'string', example: '2f62d4a1-971e-4c58-9a26-957b2489243f' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'patientId' },
                message: { type: 'string', example: 'Patient is required' }
              }
            }
          }
        }
      }
    }
  },
  paths: buildPaths()
};
