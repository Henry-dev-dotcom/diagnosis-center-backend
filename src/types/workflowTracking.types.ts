import {
  WORKFLOW_ENTITY_TYPES,
  WORKFLOW_EVENT_GROUPS,
  WORKFLOW_EVENT_TYPES,
  WORKFLOW_NOTIFICATION_AUDIENCE,
  WORKFLOW_NOTIFICATION_CHANNELS,
  WORKFLOW_SEVERITY,
} from '../constants/workflowTracking.constants';

export type WorkflowEventGroup = (typeof WORKFLOW_EVENT_GROUPS)[keyof typeof WORKFLOW_EVENT_GROUPS];
export type WorkflowEntityType = (typeof WORKFLOW_ENTITY_TYPES)[keyof typeof WORKFLOW_ENTITY_TYPES];
export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[keyof typeof WORKFLOW_EVENT_TYPES];
export type WorkflowAudience = (typeof WORKFLOW_NOTIFICATION_AUDIENCE)[keyof typeof WORKFLOW_NOTIFICATION_AUDIENCE];
export type WorkflowSeverity = (typeof WORKFLOW_SEVERITY)[keyof typeof WORKFLOW_SEVERITY];
export type WorkflowNotificationChannel = (typeof WORKFLOW_NOTIFICATION_CHANNELS)[keyof typeof WORKFLOW_NOTIFICATION_CHANNELS];

export interface WorkflowActorContext {
  userId?: string | null;
  role?: string | null;
  facilityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface WorkflowTrackingInput {
  facilityId: string;
  eventType: WorkflowEventType | string;
  eventGroup: WorkflowEventGroup | string;
  entityType: WorkflowEntityType | string;
  entityId: string;
  title: string;
  message: string;
  severity?: WorkflowSeverity | string;
  actor?: WorkflowActorContext;
  orderId?: string | null;
  patientId?: string | null;
  clinicianId?: string | null;
  resultId?: string | null;
  documentId?: string | null;
  scanId?: string | null;
  sampleId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  payload?: Record<string, unknown>;
  notify?: WorkflowNotificationTarget[];
  audit?: boolean;
}

export interface WorkflowNotificationTarget {
  userId?: string;
  role?: WorkflowAudience | string;
  facilityId?: string;
  channels?: WorkflowNotificationChannel[];
}

export interface WorkflowEventQuery {
  facilityId?: string;
  eventType?: string;
  eventGroup?: string;
  entityType?: string;
  entityId?: string;
  orderId?: string;
  patientId?: string;
  clinicianId?: string;
  severity?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface WorkflowSummaryQuery {
  facilityId?: string;
  startDate?: string;
  endDate?: string;
}

export interface WorkflowEventRecord {
  id: string;
  facilityId: string;
  actorId?: string | null;
  actorRole?: string | null;
  eventType: string;
  eventGroup: string;
  entityType: string;
  entityId: string;
  orderId?: string | null;
  patientId?: string | null;
  clinicianId?: string | null;
  resultId?: string | null;
  documentId?: string | null;
  scanId?: string | null;
  sampleId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  severity: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
