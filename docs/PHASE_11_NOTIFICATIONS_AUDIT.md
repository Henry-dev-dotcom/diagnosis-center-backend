# Phase 11: Notifications and Audit Log Workflow Tracking

This update adds one central workflow tracking layer for the multi-facility diagnostic platform.

## Purpose

Every major action in the platform should now create:

1. A workflow event record
2. An audit log record
3. A notification when users need to act or be informed

## Workflow events covered

- Facility created or updated
- Facility enabled, suspended, or disabled
- Facility features, departments, catalog, routing, branding, and limits updated
- User assigned to or removed from a facility
- Reception walk-in patient created
- Reception lab or scan request created
- Lab request received
- Lab tests accepted
- Lab result saved
- Lab test completed
- Lab sample completed
- Lab document uploaded or removed
- Lab result sent to clinician
- Scan request received
- Scan request accepted
- Scan result saved
- Scan result completed
- Scan document uploaded or removed
- Scan result sent to clinician
- Clinician result delivered, read, or archived
- Invoice created
- Payment received

## New tables

- `facility_workflow_events`
- `workflow_notification_delivery_logs`

These tables create a consistent trace of activity across facilities, requests, documents, results, and users.

## Updated existing tables

Where existing tables are present, the migration safely adds tracking columns to:

- `notifications`
- `audit_logs`

The migration uses conditional checks to avoid failing if a column already exists.

## New service

`WorkflowTrackingService` provides:

```ts
await workflowTrackingService.record({
  facilityId,
  eventType: WORKFLOW_EVENT_TYPES.LAB_RESULT_SENT_TO_CLINICIAN,
  eventGroup: WORKFLOW_EVENT_GROUPS.LABORATORY,
  entityType: WORKFLOW_ENTITY_TYPES.RESULT_DELIVERY,
  entityId: resultId,
  orderId,
  patientId,
  clinicianId,
  title: 'Lab result sent',
  message: 'A completed laboratory result was sent to the clinician.',
  actor: {
    userId: req.user.id,
    role: req.user.role,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  },
  notify: [
    { userId: clinicianId, channels: ['IN_APP'] },
  ],
  payload: {
    completedTests,
  },
});
```

## Admin workflow event routes

Register `workflowTracking.routes.ts` under your existing authenticated admin routes:

```ts
import workflowTrackingRoutes from './workflowTracking.routes';

router.use(
  '/admin/workflow-events',
  requireAuth,
  requireRoles(['SUPER_ADMIN', 'ADMIN', 'FACILITY_ADMIN']),
  workflowTrackingRoutes,
);
```

## Routes added

```text
GET /api/admin/workflow-events
GET /api/admin/workflow-events/summary
GET /api/admin/workflow-events/:eventId
```

## Integration notes

After applying Phase 11, add tracking calls inside the services from Phases 4 to 10:

- `diagnosticWorkflow.service.ts`
- `labWorkflow.service.ts`
- `scanWorkflow.service.ts`
- `receptionWorkflow.service.ts`
- `clinicianResultDelivery.service.ts`
- `facilityManagement.service.ts`
- `resultDocument.service.ts`

Use workflow tracking after the database transaction has successfully completed, or pass the transaction client into the service if you want the event to be committed atomically.
