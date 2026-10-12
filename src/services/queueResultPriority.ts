import { OrderItemStatus, ResultFlag } from '@prisma/client';

export type QueueResultPriority = 'CRITICAL' | 'ABNORMAL' | 'NORMAL' | 'UNCLASSIFIED';

type QueuePriorityOrder = {
  status: string;
  items: Array<{
    status: OrderItemStatus;
    labResults?: Array<{ parameters: Array<{ flag: ResultFlag }> }>;
  }>;
};

const COMPLETED_ITEM_STATUSES: OrderItemStatus[] = [OrderItemStatus.SIGNED_OFF, OrderItemStatus.FINAL_RELEASED];

/**
 * Summarize only the flags already stored on the current signed-off lab results.
 * This function never compares values with ranges. Imaging, missing results, and
 * NO_RANGE/PENDING flags cannot be presented as normal. A known critical or
 * abnormal flag remains visible even if another item is unclassified.
 */
export function summarizeQueueResultPriority(orders: QueuePriorityOrder[]): QueueResultPriority {
  const liveItems = orders
    .filter((order) => order.status !== 'CANCELLED')
    .flatMap((order) => order.items)
    .filter((item) => item.status !== OrderItemStatus.CANCELLED);

  if (liveItems.length === 0) return 'UNCLASSIFIED';

  let fullyClassified = true;
  let hasAbnormal = false;

  for (const item of liveItems) {
    if (!COMPLETED_ITEM_STATUSES.includes(item.status)) {
      fullyClassified = false;
      continue;
    }

    const parameters = item.labResults?.[0]?.parameters ?? [];
    if (parameters.length === 0) {
      fullyClassified = false;
      continue;
    }

    for (const parameter of parameters) {
      if (parameter.flag === ResultFlag.CRITICAL) return 'CRITICAL';
      if (parameter.flag === ResultFlag.HIGH || parameter.flag === ResultFlag.LOW) {
        hasAbnormal = true;
      } else if (parameter.flag !== ResultFlag.NORMAL) {
        fullyClassified = false;
      }
    }
  }

  if (hasAbnormal) return 'ABNORMAL';
  return fullyClassified ? 'NORMAL' : 'UNCLASSIFIED';
}
