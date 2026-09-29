import type { Router } from 'express';
import { PHASE6_ROUTE_CONTRACTS } from './phase6RouteMap.js';

/*
  API reference, generated from the routes the server actually registers, so
  it can never fall behind the code. Served at /api/docs when ENABLE_API_DOCS
  is on, and written to docs/openapi.json by `npm run docs:openapi`.
  Older hand-written route contracts still supply their summaries.
*/

type Route = { method: string; path: string };

/** Routes answered without signing in (kept in step with test/integration/securityAudit.test.ts). */
export const PUBLIC_ROUTES = new Set([
  'GET /health', 'GET /live', 'GET /ready', 'GET /database/status', 'GET /version',
  'POST /auth/login', 'POST /auth/logout', 'POST /auth/refresh',
  'GET /public/plans', 'POST /public/quote', 'POST /public/signup', 'POST /public/demo-requests',
  'POST /billing/webhooks/paystack', 'GET /billing/fake-checkout/:reference', 'GET /billing/fake-checkout/:reference/complete'
]);

const TAGS: Record<string, [string, string]> = {
  health: ['System', 'Health, readiness and version'], live: ['System', ''], ready: ['System', ''], database: ['System', ''], version: ['System', ''],
  auth: ['Auth', 'Sign-in, sessions, current user and passwords'],
  access: ['Access Control', 'Permissions and the current user\'s access'],
  public: ['Public website', 'Pricing, quotes, sign-up and demo requests (no sign-in)'],
  onboarding: ['Facility setup', 'Setup checklist, facility profile and price list import'],
  subscription: ['Subscription', 'The facility\'s plan, payments and invoices'],
  billing: ['Billing', 'Patient invoices, payments and receipts; payment gateway webhooks'],
  platform: ['Platform', 'Platform operator: facilities, plans, subscribers, metrics, support sessions'],
  patients: ['Patients', 'Patient records and their clinical data'],
  encounters: ['Visits (OPD)', 'Visits, triage, notes, diagnoses, prescriptions and clinical forms'],
  emergency: ['Emergency', 'Emergency department'],
  pharmacy: ['Pharmacy', 'Drugs, stock, dispensing'],
  inpatient: ['Wards', 'Wards, beds, admissions, nursing care and discharge'],
  theatre: ['Theatre', 'Theatres, surgery bookings and the safety checklist'],
  maternity: ['Maternity', 'Pregnancies, antenatal and postnatal care, deliveries'],
  'child-health': ['Child health', 'Growth and immunisations'],
  claims: ['Insurance claims', 'Schemes, memberships, claims and batches'],
  stores: ['Stores', 'Store items, suppliers, purchase orders and requisitions'],
  'blood-bank': ['Blood bank', 'Donors, units, crossmatch, issue and transfusion'],
  mortuary: ['Mortuary', 'Deceased register, slots, certification and release'],
  hr: ['HR', 'Staff profiles, shift types, rota and leave'],
  records: ['Medical records', 'Full chart, access log, release-of-information requests'],
  admin: ['Admin', 'Users, roles, catalog, departments, equipment, audit log, data export'],
  orders: ['Orders', 'Lab and scan orders'], reception: ['Reception', 'Check-in, walk-ins, appointments, visits'],
  lab: ['Laboratory', 'Samples, results, review and sign-off'], scan: ['Imaging', 'Scan queue, bookings, reports and sign-off'],
  finance: ['Finance', 'Cashier shifts, float, expenses and ledger'], results: ['Results', 'Released results and delivery'],
  reports: ['Reports', 'Operational and finance reports'], notifications: ['Notifications', 'In-app notifications'], files: ['Files', 'Uploads and signed downloads']
};

export function listRoutes(router: Router): Route[] {
  const found: Route[] = [];
  const walk = (stack: unknown[]) => {
    for (const layer of stack as { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown[] } }[]) {
      if (layer.route) for (const method of Object.keys(layer.route.methods)) found.push({ method: method.toUpperCase(), path: layer.route.path });
      else if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk((router as unknown as { stack: unknown[] }).stack);
  return found;
}

const summaries = new Map(PHASE6_ROUTE_CONTRACTS.map((c) => [`${c.method} ${c.path}`, c.summary]));
const tagFor = (path: string) => {
  const segment = path.split('/')[1] || 'system';
  return TAGS[segment]?.[0] ?? segment.replace(/(^|-)(\w)/g, (_m, dash, ch) => `${dash ? ' ' : ''}${ch.toUpperCase()}`);
};

export function buildOpenApiDocument(router: Router) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of listRoutes(router)) {
    const key = r.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const isPublic = PUBLIC_ROUTES.has(`${r.method} ${r.path}`);
    paths[key] ??= {};
    paths[key][r.method.toLowerCase()] = {
      tags: [tagFor(r.path)],
      summary: summaries.get(`${r.method} ${r.path}`) ?? `${r.method} ${r.path}`,
      security: isPublic ? [] : [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: [...r.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } })),
      ...(['POST', 'PUT', 'PATCH'].includes(r.method) ? { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } } : {}),
      responses: {
        '200': { description: 'Success: { success: true, message, data }', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } } },
        '400': { description: 'Validation failed (errors lists each field)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        ...(isPublic ? {} : { '401': { description: 'Not signed in, or the session expired' }, '402': { description: 'Subscription unpaid: the facility is read-only' }, '403': { description: 'Role, permission, department or support-session restriction' } }),
        '404': { description: 'Not found' },
        '429': { description: 'Rate limit reached' }
      }
    };
  }
  const usedTags = new Set(Object.values(paths).flatMap((ops) => Object.values(ops).map((op) => (op as { tags: string[] }).tags[0])));
  const tagDescriptions = new Map(Object.values(TAGS).filter(([, d]) => d).map(([name, d]) => [name, d]));
  return {
    openapi: '3.0.3',
    info: {
      title: 'LHIMS API',
      version: '3.0.0',
      description: [
        'Hospital management API. Every facility\'s data is separate: staff act only inside their own facility.',
        'Browsers authenticate with the httpOnly session cookie set by POST /auth/login; other clients may send the access token as a Bearer header.',
        'All responses use the envelope { success, message, data } or { success: false, message, code, errors }.',
        'Writes return 402 while a facility\'s subscription is unpaid, and 403 during a read-only support session.'
      ].join('\n\n')
    },
    servers: [{ url: '/api', description: 'This server' }],
    tags: [...usedTags].sort().map((name) => ({ name, description: tagDescriptions.get(name) ?? '' })),
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'access_token' },
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      },
      schemas: {
        ApiSuccess: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string' }, data: {} } },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            code: { type: 'string', example: 'VALIDATION_FAILED' },
            requestId: { type: 'string' },
            errors: { type: 'array', items: { type: 'object', properties: { field: { type: 'string', example: 'facility.name' }, message: { type: 'string', example: 'Enter the facility name' } } } }
          }
        }
      }
    },
    paths
  };
}
