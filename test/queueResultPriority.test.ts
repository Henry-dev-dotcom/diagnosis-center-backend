import { describe, expect, it } from 'vitest';
import { OrderItemStatus, ResultFlag } from '@prisma/client';
import { summarizeQueueResultPriority } from '../src/services/queueResultPriority.js';

const item = (flags: ResultFlag[], status = OrderItemStatus.SIGNED_OFF) => ({
  status,
  labResults: flags.length ? [{ parameters: flags.map((flag) => ({ flag })) }] : []
});
const order = (items: ReturnType<typeof item>[], status = 'CONFIRMED') => ({ status, items });

describe('clinician queue result priority', () => {
  it('surfaces a stored critical flag before other flags', () => {
    expect(summarizeQueueResultPriority([
      order([item([ResultFlag.NORMAL, ResultFlag.HIGH])]),
      order([item([ResultFlag.CRITICAL])])
    ])).toBe('CRITICAL');
  });

  it('summarizes stored high or low flags as abnormal', () => {
    expect(summarizeQueueResultPriority([order([item([ResultFlag.LOW, ResultFlag.NORMAL])])])).toBe('ABNORMAL');
    expect(summarizeQueueResultPriority([order([item([ResultFlag.HIGH])])])).toBe('ABNORMAL');
  });

  it('reports normal only when every live completed result is classified normal', () => {
    expect(summarizeQueueResultPriority([order([item([ResultFlag.NORMAL]), item([ResultFlag.NORMAL, ResultFlag.NORMAL])])])).toBe('NORMAL');
  });

  it('does not turn missing, out-of-range, pending, imaging, or unfinished results into normal', () => {
    expect(summarizeQueueResultPriority([order([item([])])])).toBe('UNCLASSIFIED');
    expect(summarizeQueueResultPriority([order([item([ResultFlag.NO_RANGE])])])).toBe('UNCLASSIFIED');
    expect(summarizeQueueResultPriority([order([item([ResultFlag.PENDING])])])).toBe('UNCLASSIFIED');
    expect(summarizeQueueResultPriority([order([item([], OrderItemStatus.FINAL_RELEASED)])])).toBe('UNCLASSIFIED');
    expect(summarizeQueueResultPriority([order([item([ResultFlag.NORMAL]), item([ResultFlag.NORMAL], OrderItemStatus.REQUESTED)])])).toBe('UNCLASSIFIED');
    expect(summarizeQueueResultPriority([order([item([ResultFlag.CRITICAL])], 'CANCELLED')])).toBe('UNCLASSIFIED');
    expect(summarizeQueueResultPriority([order([item([ResultFlag.CRITICAL], OrderItemStatus.CANCELLED)])])).toBe('UNCLASSIFIED');
  });

  it('keeps a known abnormal result visible when another result is unclassified', () => {
    expect(summarizeQueueResultPriority([order([item([ResultFlag.HIGH]), item([ResultFlag.NO_RANGE])])])).toBe('ABNORMAL');
  });
});
