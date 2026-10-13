import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/prisma.service.js', () => ({ prisma: {} }));

import { outstandingDiagnosticTypes } from '../src/services/labPing.service.js';
import { withoutBlocking } from '../src/services/analyzer/alert.service.js';

describe('who a diagnostic status request goes to', () => {
  it('names only the kinds of work still outstanding on an order', () => {
    const order = { items: [{ type: 'LAB', status: 'SIGNED_OFF' }, { type: 'SCAN', status: 'REQUESTED' }] } as never;
    expect([...outstandingDiagnosticTypes(order)]).toEqual(['SCAN']);
  });

  it('names both teams when both still have work', () => {
    const order = { items: [{ type: 'LAB', status: 'ACCEPTED' }, { type: 'SCAN', status: 'REQUESTED' }, { type: 'LAB', status: 'CANCELLED' }] } as never;
    expect([...outstandingDiagnosticTypes(order)].sort()).toEqual(['LAB', 'SCAN']);
  });
});

describe('an alert that fails', () => {
  it('is logged and swallowed, so the work it was raised about carries on', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(withoutBlocking('test alert', async () => { throw new Error('notifications are down'); })).resolves.toBeNull();
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it('passes a working alert straight through', async () => {
    await expect(withoutBlocking('test alert', async () => ({ created: true }))).resolves.toEqual({ created: true });
  });
});
