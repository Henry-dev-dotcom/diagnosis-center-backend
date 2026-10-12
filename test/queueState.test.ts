import { describe, expect, it } from 'vitest';
import { EncounterStatus, OrderItemStatus } from '@prisma/client';
import { deriveQueueState, testProgress, type OrderForQueue } from '../src/services/queueState.js';

const order = (items: OrderItemStatus[], status = 'CONFIRMED'): OrderForQueue => ({ status, items: items.map((s) => ({ status: s, catalogItem: { name: `Test ${s}` } })) });
const paused = { status: EncounterStatus.IN_CONSULTATION, suspendedAt: new Date() };

describe('where a visit sits in the clinician queue', () => {
  it('places visits by their stage', () => {
    expect(deriveQueueState({ status: EncounterStatus.WAITING_TRIAGE, suspendedAt: null }, [])).toBe('WAITING_TRIAGE');
    expect(deriveQueueState({ status: EncounterStatus.WAITING_DOCTOR, suspendedAt: null }, [])).toBe('NEW');
    expect(deriveQueueState({ status: EncounterStatus.IN_CONSULTATION, suspendedAt: null }, [])).toBe('IN_CONSULTATION');
    expect(deriveQueueState({ status: EncounterStatus.COMPLETED, suspendedAt: null }, [])).toBe('CLOSED');
    expect(deriveQueueState({ status: EncounterStatus.CANCELLED, suspendedAt: null }, [])).toBe('CLOSED');
  });

  it('keeps a paused visit in Pending Labs until every test is signed off', () => {
    expect(deriveQueueState(paused, [order([OrderItemStatus.REQUESTED])])).toBe('PENDING_LABS');
    expect(deriveQueueState(paused, [order([OrderItemStatus.SIGNED_OFF, OrderItemStatus.PENDING_REVIEW])])).toBe('PENDING_LABS');
    expect(deriveQueueState(paused, [order([OrderItemStatus.SIGNED_OFF, OrderItemStatus.FINAL_RELEASED])])).toBe('REVIEW_READY');
  });

  it('treats a rejected sample or a retest as still outstanding', () => {
    expect(deriveQueueState(paused, [order([OrderItemStatus.REJECTED])])).toBe('PENDING_LABS');
    expect(deriveQueueState(paused, [order([OrderItemStatus.RETEST_REQUESTED])])).toBe('PENDING_LABS');
  });

  it('stops waiting for anything cancelled, whether the item or the whole order', () => {
    expect(deriveQueueState(paused, [order([OrderItemStatus.CANCELLED])])).toBe('REVIEW_READY');
    expect(deriveQueueState(paused, [order([OrderItemStatus.REQUESTED], 'CANCELLED')])).toBe('REVIEW_READY');
    expect(deriveQueueState(paused, [order([OrderItemStatus.SIGNED_OFF]), order([OrderItemStatus.REQUESTED], 'CANCELLED')])).toBe('REVIEW_READY');
  });

  it('counts progress and names what is outstanding', () => {
    const progress = testProgress([order([OrderItemStatus.SIGNED_OFF, OrderItemStatus.DRAFT, OrderItemStatus.CANCELLED])]);
    expect(progress.total).toBe(2);
    expect(progress.ready).toBe(1);
    expect(progress.outstanding).toEqual(['Test DRAFT']);
  });
});
