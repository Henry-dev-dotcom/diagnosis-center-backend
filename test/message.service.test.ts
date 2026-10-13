import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/prisma.service.js', () => ({
  prisma: {
    staffMessage: {
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn()
    }
  }
}));

import type { Request } from 'express';
import { prisma } from '../src/services/prisma.service.js';
import { listChannels, listDepartmentMessages, listMessages, sendMessage } from '../src/services/message.service.js';

function request(role: string, id = 'test-sender'): Request {
  return { user: { role, id }, query: {} } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.staffMessage.deleteMany).mockResolvedValue({ count: 0 });
  vi.mocked(prisma.staffMessage.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.staffMessage.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.staffMessage.create).mockResolvedValue({ id: 'message-1' } as never);
});

describe('private department messaging', () => {
  it('offers other departments but not the sender’s own department', async () => {
    const result = await listChannels(request('LAB_STAFF'));
    expect(result.ownDepartment?.key).toBe('LABORATORY');
    const keys = result.directDepartments.map((department) => department.key);
    expect(keys).toContain('FINANCE');
    expect(keys).toContain('ADMINISTRATION');
    expect(keys).not.toContain('LABORATORY');
  });

  it('queries a thread using only the two participating department pairs', async () => {
    await listDepartmentMessages('FINANCE', {}, request('LAB_STAFF'));
    expect(prisma.staffMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { senderDepartment: 'LABORATORY', recipientDepartment: 'FINANCE' },
          { senderDepartment: 'FINANCE', recipientDepartment: 'LABORATORY' }
        ]
      })
    }));
  });

  it('does not query another pair’s thread for unrelated departments', async () => {
    await listDepartmentMessages('FINANCE', {}, request('DOCTOR'));
    expect(prisma.staffMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { senderDepartment: 'CLINICAL', recipientDepartment: 'FINANCE' },
          { senderDepartment: 'FINANCE', recipientDepartment: 'CLINICAL' }
        ]
      })
    }));
  });

  it('persists the sender and recipient department on a direct message', async () => {
    await sendMessage({ recipientDepartment: 'FINANCE', body: '  Please review this  ' }, request('LAB_STAFF', 'lab-user'));
    expect(prisma.staffMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        senderDepartment: 'LABORATORY',
        recipientDepartment: 'FINANCE',
        senderId: 'lab-user',
        body: 'Please review this'
      })
    }));
  });

  it('keeps direct messages out of shared/group channel history', async () => {
    await listMessages('ALL', {}, request('DOCTOR'));
    expect(prisma.staffMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { channel: 'ALL', recipientDepartment: null, expiresAt: expect.any(Object) }
    }));
  });

  it('rejects sending to the sender’s own department', async () => {
    await expect(sendMessage(
      { recipientDepartment: 'LABORATORY', body: 'No loop' },
      request('LAB_STAFF')
    )).rejects.toMatchObject({ statusCode: 400, code: 'MESSAGE_DEPARTMENT_SELF' });
    expect(prisma.staffMessage.create).not.toHaveBeenCalled();
  });
});
