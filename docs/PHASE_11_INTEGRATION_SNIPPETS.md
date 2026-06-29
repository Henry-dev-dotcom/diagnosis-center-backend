# Phase 11 Integration Snippets

## 1. Lab result pushed to clinician

```ts
await workflowTrackingService.record({
  facilityId,
  eventType: WORKFLOW_EVENT_TYPES.LAB_RESULT_SENT_TO_CLINICIAN,
  eventGroup: WORKFLOW_EVENT_GROUPS.LABORATORY,
  entityType: WORKFLOW_ENTITY_TYPES.RESULT_DELIVERY,
  entityId: delivery.id,
  orderId: sample.orderId,
  patientId: sample.patientId,
  clinicianId: sample.clinicianId,
  resultId: delivery.resultId,
  sampleId: sample.id,
  title: 'Laboratory result sent',
  message: 'Completed laboratory results were sent directly to the clinician.',
  actor: requestActor,
  notify: [{ userId: sample.clinicianId }],
  payload: { testCount: sample.tests.length },
});
```

## 2. Lab document uploaded

```ts
await workflowTrackingService.record({
  facilityId,
  eventType: WORKFLOW_EVENT_TYPES.LAB_DOCUMENT_UPLOADED,
  eventGroup: WORKFLOW_EVENT_GROUPS.DOCUMENTS,
  entityType: WORKFLOW_ENTITY_TYPES.DOCUMENT,
  entityId: document.id,
  orderId,
  patientId,
  documentId: document.id,
  sampleId,
  title: 'Lab document uploaded',
  message: 'A result document was attached to a laboratory test.',
  actor: requestActor,
  payload: {
    originalName: document.originalName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    testId,
  },
});
```

## 3. Scan request accepted

```ts
await workflowTrackingService.record({
  facilityId,
  eventType: WORKFLOW_EVENT_TYPES.SCAN_REQUEST_ACCEPTED,
  eventGroup: WORKFLOW_EVENT_GROUPS.SCAN,
  entityType: WORKFLOW_ENTITY_TYPES.SCAN_ACCEPTED_REQUEST,
  entityId: acceptedScan.id,
  orderId,
  patientId,
  scanId: acceptedScan.id,
  clinicianId,
  title: 'Scan request accepted',
  message: 'A scan request was accepted into the imaging workflow.',
  actor: requestActor,
  payload: { acceptedScans },
});
```

## 4. Reception walk-in lab request

```ts
await workflowTrackingService.record({
  facilityId,
  eventType: WORKFLOW_EVENT_TYPES.RECEPTION_LAB_REQUEST_CREATED,
  eventGroup: WORKFLOW_EVENT_GROUPS.RECEPTION,
  entityType: WORKFLOW_ENTITY_TYPES.ORDER,
  entityId: order.id,
  orderId: order.id,
  patientId,
  clinicianId,
  title: 'Walk-in lab request created',
  message: 'Reception created a walk-in laboratory request and routed it to the Lab Queue.',
  actor: requestActor,
  notify: [{ role: WORKFLOW_NOTIFICATION_AUDIENCE.LAB_STAFF, facilityId }],
  payload: { requestedTests },
});
```

## 5. Facility created

```ts
await workflowTrackingService.record({
  facilityId: facility.id,
  eventType: WORKFLOW_EVENT_TYPES.FACILITY_CREATED,
  eventGroup: WORKFLOW_EVENT_GROUPS.FACILITY,
  entityType: WORKFLOW_ENTITY_TYPES.FACILITY,
  entityId: facility.id,
  title: 'Facility created',
  message: 'A new diagnostic facility was added to the platform.',
  actor: requestActor,
  notify: [{ role: WORKFLOW_NOTIFICATION_AUDIENCE.SUPER_ADMIN }],
  payload: {
    name: facility.name,
    code: facility.code,
    type: facility.type,
  },
});
```
