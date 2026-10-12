import { AnalyzerMessageStatus, NotificationType, UserRole, UserStatus, type AnalyzerDevice } from '@prisma/client';
import { prisma } from '../prisma.service.js';

/** Operational rules for analyzer monitoring. Keep these conservative and visible in the UI. */
export const ANALYZER_ALERT_RULES = {
  qcFailure: 'Create an alert for every QC run recorded as FAIL.',
  reliabilityThreshold: 90,
  reliabilityMinimumMessages: 5,
  reliabilityWindowMessages: 20,
  cooldownHours: 6
} as const;

const exceptionStatuses = new Set<AnalyzerMessageStatus>([
  AnalyzerMessageStatus.UNMATCHED,
  AnalyzerMessageStatus.PARTIAL,
  AnalyzerMessageStatus.FAILED
]);

async function activeRecipients() {
  return prisma.user.findMany({
    where: { role: { in: [UserRole.ADMIN, UserRole.LAB_STAFF] }, status: UserStatus.ACTIVE },
    select: { id: true }
  });
}

async function createAlertIfNotRecentlySent(title: string, body: string) {
  const since = new Date(Date.now() - ANALYZER_ALERT_RULES.cooldownHours * 60 * 60 * 1000);
  const recent = await prisma.notification.findFirst({ where: { title, createdAt: { gte: since } }, select: { id: true } });
  if (recent) return { created: false, reason: 'cooldown' as const };
  const recipients = await activeRecipients();
  if (!recipients.length) return { created: false, reason: 'no-recipients' as const };
  await prisma.notification.createMany({
    data: recipients.map(({ id }) => ({
      type: NotificationType.SYSTEM_ALERT,
      title,
      body,
      recipientUserId: id,
      isRead: false
    }))
  });
  return { created: true, recipientCount: recipients.length };
}

export async function evaluateQcRunAlert(run: {
  result: string;
  parameterName: string;
  controlLevel?: string | null;
  value?: unknown;
  expectedMean?: unknown;
}) {
  if (String(run.result).toUpperCase() !== 'FAIL') return { triggered: false, rule: 'qcFailure' as const };
  const detail = [run.controlLevel, run.value != null ? `value ${run.value}` : null, run.expectedMean != null ? `expected ${run.expectedMean}` : null].filter(Boolean).join(', ');
  const alert = await createAlertIfNotRecentlySent(
    `Analyzer QC failure: ${run.parameterName}`,
    `A laboratory analyzer QC run failed for ${run.parameterName}${detail ? ` (${detail})` : ''}. Hold affected patient results, investigate the analyzer/reagents, and record corrective action.`
  );
  return { triggered: true, rule: 'qcFailure' as const, ...alert };
}

export async function evaluateAnalyzerReliabilityAlert(device: Pick<AnalyzerDevice, 'id' | 'name'>) {
  const recent = await prisma.analyzerMessage.findMany({
    where: { deviceId: device.id },
    orderBy: { receivedAt: 'desc' },
    take: ANALYZER_ALERT_RULES.reliabilityWindowMessages,
    select: { status: true, appliedCount: true, skippedCount: true }
  });
  if (recent.length < ANALYZER_ALERT_RULES.reliabilityMinimumMessages) {
    return { triggered: false, rule: 'lowReliability' as const, sampleSize: recent.length };
  }
  const exceptions = recent.filter((message) => exceptionStatuses.has(message.status)).length;
  const reliability = ((recent.length - exceptions) / recent.length) * 100;
  if (reliability >= ANALYZER_ALERT_RULES.reliabilityThreshold) {
    return { triggered: false, rule: 'lowReliability' as const, sampleSize: recent.length, reliability };
  }
  const alert = await createAlertIfNotRecentlySent(
    `Analyzer reliability low: ${device.name}`,
    `${device.name} reliability is ${Math.round(reliability)}% across the latest ${recent.length} messages, below the ${ANALYZER_ALERT_RULES.reliabilityThreshold}% threshold. Review interface connectivity, barcode quality and test mappings.`
  );
  return { triggered: true, rule: 'lowReliability' as const, sampleSize: recent.length, reliability, ...alert };
}
