import { EncounterStatus, OrderItemStatus } from '@prisma/client';

/*
  Which part of the clinician's queue a visit belongs to.

  Nothing here is stored. A visit that has been sent off for tests stays
  IN_CONSULTATION with a `suspendedAt` time, and where it sits is worked out from
  how far its tests have got. That way:
    - a lab withdrawing a signed-off result sends the patient back to Pending Labs
      with no extra code, and
    - the lab and imaging screens do not need to know the queue exists.

  A test counts as back once it is signed off (or released). A cancelled test or
  order is no longer being waited for.
*/

export type QueueState = 'WAITING_TRIAGE' | 'NEW' | 'IN_CONSULTATION' | 'PENDING_LABS' | 'REVIEW_READY' | 'CLOSED';

const BACK: OrderItemStatus[] = [OrderItemStatus.SIGNED_OFF, OrderItemStatus.FINAL_RELEASED];

export type OrderForQueue = {
  status: string;
  items: Array<{ status: OrderItemStatus; catalogItem?: { name: string } | null }>;
};

/** Counts the tests and scans a visit is still waiting on, ignoring anything cancelled. */
export function testProgress(orders: OrderForQueue[]) {
  const live = orders
    .filter((order) => order.status !== 'CANCELLED')
    .flatMap((order) => order.items)
    .filter((item) => item.status !== OrderItemStatus.CANCELLED);
  const ready = live.filter((item) => BACK.includes(item.status));
  const outstanding = live.filter((item) => !BACK.includes(item.status)).map((item) => item.catalogItem?.name ?? 'Test');
  return { total: live.length, ready: ready.length, outstanding };
}

export function deriveQueueState(encounter: { status: EncounterStatus; suspendedAt: Date | null }, orders: OrderForQueue[]): QueueState {
  switch (encounter.status) {
    case EncounterStatus.WAITING_TRIAGE:
      return 'WAITING_TRIAGE';
    case EncounterStatus.WAITING_DOCTOR:
      return 'NEW';
    case EncounterStatus.IN_CONSULTATION:
      if (!encounter.suspendedAt) return 'IN_CONSULTATION';
      // Nothing left to wait for (everything came back, or was cancelled) means the clinician can carry on.
      return testProgress(orders).outstanding.length === 0 ? 'REVIEW_READY' : 'PENDING_LABS';
    default:
      return 'CLOSED';
  }
}
