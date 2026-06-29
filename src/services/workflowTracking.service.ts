import { PrismaClient } from '@prisma/client';
import { makeNotificationMessage, makeWorkflowEventId, normalizeWorkflowLimit, normalizeWorkflowPage, sanitizeWorkflowPayload, validateWorkflowTrackingInput, workflowOffset, buildWorkflowWhereSql, defaultSeverity } from '../utils/workflowTracking.utils';
import { WorkflowEventQuery, WorkflowTrackingInput, WorkflowNotificationTarget, WorkflowSummaryQuery } from '../types/workflowTracking.types';
import { WORKFLOW_NOTIFICATION_CHANNELS } from '../constants/workflowTracking.constants';

export class WorkflowTrackingService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: WorkflowTrackingInput) {
    validateWorkflowTrackingInput(input);

    const event = await this.createWorkflowEvent(input);

    if (input.audit !== false) {
      await this.createAuditLog(input, event.id);
    }

    if (input.notify?.length) {
      await this.dispatchNotifications(input, event.id, input.notify);
    }

    return event;
  }

  async list(query: WorkflowEventQuery) {
    const page = normalizeWorkflowPage(query.page);
    const limit = normalizeWorkflowLimit(query.limit);
    const offset = workflowOffset(page, limit);
    const { whereSql, values } = buildWorkflowWhereSql(query);

    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM facility_workflow_events ${whereSql} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      ...values,
      limit,
      offset,
    );

    const countRows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM facility_workflow_events ${whereSql}`,
      ...values,
    );

    const total = Number(countRows?.[0]?.count || 0);

    return {
      data: rows,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getById(eventId: string, facilityId?: string) {
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM facility_workflow_events WHERE id = $1 ${facilityId ? 'AND facility_id = $2' : ''} LIMIT 1`,
      ...(facilityId ? [eventId, facilityId] : [eventId]),
    );

    return rows?.[0] || null;
  }

  async summary(query: WorkflowSummaryQuery) {
    const clauses: string[] = [];
    const values: unknown[] = [];

    const add = (clause: string, value?: unknown) => {
      if (value === undefined || value === null || value === '') return;
      values.push(value);
      clauses.push(clause.replace('?', `$${values.length}`));
    };

    add('facility_id = ?', query.facilityId);
    add('created_at >= ?::timestamptz', query.startDate);
    add('created_at <= ?::timestamptz', query.endDate);

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const byGroup = await (this.prisma as any).$queryRawUnsafe(
      `SELECT event_group, COUNT(*)::int AS count FROM facility_workflow_events ${whereSql} GROUP BY event_group ORDER BY count DESC`,
      ...values,
    );

    const byType = await (this.prisma as any).$queryRawUnsafe(
      `SELECT event_type, COUNT(*)::int AS count FROM facility_workflow_events ${whereSql} GROUP BY event_type ORDER BY count DESC LIMIT 20`,
      ...values,
    );

    const bySeverity = await (this.prisma as any).$queryRawUnsafe(
      `SELECT severity, COUNT(*)::int AS count FROM facility_workflow_events ${whereSql} GROUP BY severity ORDER BY count DESC`,
      ...values,
    );

    return { byGroup, byType, bySeverity };
  }

  private async createWorkflowEvent(input: WorkflowTrackingInput) {
    const id = makeWorkflowEventId();
    const payload = sanitizeWorkflowPayload(input.payload);

    const rows = await (this.prisma as any).$queryRawUnsafe(
      `INSERT INTO facility_workflow_events (
        id, facility_id, actor_id, actor_role, actor_ip, actor_user_agent,
        event_type, event_group, entity_type, entity_id,
        order_id, patient_id, clinician_id, result_id, document_id, scan_id, sample_id, invoice_id, payment_id,
        severity, title, message, payload
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb
      ) RETURNING *`,
      id,
      input.facilityId,
      input.actor?.userId || null,
      input.actor?.role || null,
      input.actor?.ipAddress || null,
      input.actor?.userAgent || null,
      input.eventType,
      input.eventGroup,
      input.entityType,
      input.entityId,
      input.orderId || null,
      input.patientId || null,
      input.clinicianId || null,
      input.resultId || null,
      input.documentId || null,
      input.scanId || null,
      input.sampleId || null,
      input.invoiceId || null,
      input.paymentId || null,
      defaultSeverity(input.severity),
      input.title,
      input.message,
      JSON.stringify(payload),
    );

    return rows[0];
  }

  private async createAuditLog(input: WorkflowTrackingInput, workflowEventId: string) {
    const payload = {
      workflowEventId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      orderId: input.orderId,
      patientId: input.patientId,
      clinicianId: input.clinicianId,
      resultId: input.resultId,
      documentId: input.documentId,
      sampleId: input.sampleId,
      scanId: input.scanId,
      ...sanitizeWorkflowPayload(input.payload),
    };

    try {
      const prismaAny = this.prisma as any;
      if (prismaAny.auditLog?.create) {
        return await prismaAny.auditLog.create({
          data: {
            facilityId: input.facilityId,
            userId: input.actor?.userId || null,
            action: input.eventType,
            entityType: input.entityType,
            entityId: input.entityId,
            description: input.message,
            ipAddress: input.actor?.ipAddress || null,
            userAgent: input.actor?.userAgent || null,
            metadata: payload,
            workflowEventId,
          },
        });
      }
    } catch {
      // Keep workflow action alive even if an older AuditLog schema has different columns.
    }

    return null;
  }

  private async dispatchNotifications(input: WorkflowTrackingInput, workflowEventId: string, targets: WorkflowNotificationTarget[]) {
    const users = await this.resolveNotificationUsers(input.facilityId, targets);
    const uniqueUsers = Array.from(new Set(users.filter(Boolean)));

    const created: unknown[] = [];
    for (const userId of uniqueUsers) {
      try {
        const prismaAny = this.prisma as any;
        if (prismaAny.notification?.create) {
          const notification = await prismaAny.notification.create({
            data: {
              userId,
              facilityId: input.facilityId,
              title: input.title,
              message: makeNotificationMessage(input),
              type: input.eventType,
              category: input.eventGroup,
              severity: defaultSeverity(input.severity),
              status: 'UNREAD',
              orderId: input.orderId || null,
              patientId: input.patientId || null,
              resultId: input.resultId || null,
              workflowEventId,
              metadata: sanitizeWorkflowPayload(input.payload),
            },
          });
          created.push(notification);
        }
      } catch {
        // Keep workflow action alive even if an older Notification schema has different columns.
      }
    }

    await this.createNotificationDeliveryLog(input, workflowEventId, uniqueUsers, targets);
    return created;
  }

  private async resolveNotificationUsers(facilityId: string, targets: WorkflowNotificationTarget[]): Promise<string[]> {
    const userIds = targets.filter((target) => target.userId).map((target) => String(target.userId));
    const roles = targets.filter((target) => target.role).map((target) => String(target.role));

    if (!roles.length) return userIds;

    try {
      const rows = await (this.prisma as any).$queryRawUnsafe(
        `SELECT DISTINCT COALESCE(fua.user_id, u.id)::text AS user_id
         FROM users u
         LEFT JOIN facility_user_assignments fua ON fua.user_id = u.id
         WHERE (fua.facility_id = $1 OR u.facility_id = $1)
         AND UPPER(COALESCE(fua.role, u.role)) = ANY($2::text[])
         AND COALESCE(fua.status, u.status, 'ACTIVE') = 'ACTIVE'`,
        facilityId,
        roles.map((role) => role.toUpperCase()),
      );
      return [...userIds, ...(rows || []).map((row: any) => row.user_id)];
    } catch {
      return userIds;
    }
  }

  private async createNotificationDeliveryLog(input: WorkflowTrackingInput, workflowEventId: string, userIds: string[], targets: WorkflowNotificationTarget[]) {
    const channelList = Array.from(
      new Set(targets.flatMap((target) => target.channels || [WORKFLOW_NOTIFICATION_CHANNELS.IN_APP])),
    );

    try {
      await (this.prisma as any).$executeRawUnsafe(
        `INSERT INTO workflow_notification_delivery_logs (
          id, workflow_event_id, facility_id, recipient_user_ids, recipient_targets, channels, title, message, status
        ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9)`,
        makeWorkflowEventId('wnd'),
        workflowEventId,
        input.facilityId,
        JSON.stringify(userIds),
        JSON.stringify(targets),
        JSON.stringify(channelList),
        input.title,
        makeNotificationMessage(input),
        'CREATED',
      );
    } catch {
      // Optional delivery archive table may not be present in early local databases.
    }
  }
}
