import crypto from 'crypto';
import { DEFAULT_WORKFLOW_PAGE_SIZE, MAX_WORKFLOW_PAGE_SIZE, WORKFLOW_SEVERITY } from '../constants/workflowTracking.constants';
import { WorkflowEventQuery, WorkflowTrackingInput } from '../types/workflowTracking.types';

export function normalizeWorkflowLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_WORKFLOW_PAGE_SIZE;
  return Math.min(Math.max(Number(limit), 1), MAX_WORKFLOW_PAGE_SIZE);
}

export function normalizeWorkflowPage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Number(page), 1);
}

export function workflowOffset(page?: number, limit?: number): number {
  const safePage = normalizeWorkflowPage(page);
  const safeLimit = normalizeWorkflowLimit(limit);
  return (safePage - 1) * safeLimit;
}

export function sanitizeWorkflowPayload(payload?: Record<string, unknown>): Record<string, unknown> {
  if (!payload) return {};
  const blockedKeys = ['password', 'token', 'accessToken', 'refreshToken', 'authorization', 'Authorization'];
  return Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (blockedKeys.includes(key)) return acc;
    if (value === undefined) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

export function makeWorkflowEventId(prefix = 'wfe'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function validateWorkflowTrackingInput(input: WorkflowTrackingInput): void {
  if (!input.facilityId) throw new Error('facilityId is required for workflow tracking');
  if (!input.eventType) throw new Error('eventType is required for workflow tracking');
  if (!input.eventGroup) throw new Error('eventGroup is required for workflow tracking');
  if (!input.entityType) throw new Error('entityType is required for workflow tracking');
  if (!input.entityId) throw new Error('entityId is required for workflow tracking');
  if (!input.title) throw new Error('title is required for workflow tracking');
  if (!input.message) throw new Error('message is required for workflow tracking');
}

export function buildWorkflowWhereSql(query: WorkflowEventQuery): { whereSql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  const add = (clause: string, value?: unknown) => {
    if (value === undefined || value === null || value === '') return;
    values.push(value);
    clauses.push(clause.replace('?', `$${values.length}`));
  };

  add('facility_id = ?', query.facilityId);
  add('event_type = ?', query.eventType);
  add('event_group = ?', query.eventGroup);
  add('entity_type = ?', query.entityType);
  add('entity_id = ?', query.entityId);
  add('order_id = ?', query.orderId);
  add('patient_id = ?', query.patientId);
  add('clinician_id = ?', query.clinicianId);
  add('severity = ?', query.severity);
  add('created_at >= ?::timestamptz', query.startDate);
  add('created_at <= ?::timestamptz', query.endDate);

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

export function defaultSeverity(severity?: string): string {
  return severity || WORKFLOW_SEVERITY.INFO;
}

export function makeNotificationMessage(input: WorkflowTrackingInput): string {
  const order = input.orderId ? ` Order: ${input.orderId}.` : '';
  return `${input.message}${order}`;
}
