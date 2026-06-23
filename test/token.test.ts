import { describe, it, expect } from 'vitest';
import { UserRole } from '@prisma/client';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  getRefreshExpiryDate,
  addDays
} from '../src/utils/token.js';

const accessPayload = {
  sub: 'user-123',
  role: UserRole.DOCTOR,
  sessionId: 'session-abc',
  type: 'access' as const
};

const refreshPayload = {
  sub: 'user-123',
  role: UserRole.DOCTOR,
  sessionId: 'session-abc',
  type: 'refresh' as const
};

describe('access tokens', () => {
  it('signs and verifies a round-trip, preserving claims', () => {
    const token = signAccessToken(accessPayload);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.role).toBe(UserRole.DOCTOR);
    expect(decoded.sessionId).toBe('session-abc');
    expect(decoded.type).toBe('access');
  });

  it('produces a token with three JWT segments', () => {
    const token = signAccessToken(accessPayload);
    expect(token.split('.')).toHaveLength(3);
  });
});

describe('refresh tokens', () => {
  it('signs and verifies a round-trip', () => {
    const token = signRefreshToken(refreshPayload);
    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.type).toBe('refresh');
  });
});

describe('token secret isolation', () => {
  it('does not verify an access token with the refresh secret', () => {
    const accessToken = signAccessToken(accessPayload);
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });

  it('does not verify a refresh token with the access secret', () => {
    const refreshToken = signRefreshToken(refreshPayload);
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken(accessPayload);
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('rejects a structurally invalid token', () => {
    expect(() => verifyAccessToken('not.a.jwt')).toThrow();
  });
});

describe('hashToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('returns a 64-character hex SHA-256 digest', () => {
    expect(hashToken('anything')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not store the raw token', () => {
    const raw = 'super-secret-refresh-token';
    expect(hashToken(raw)).not.toContain(raw);
  });
});

describe('getRefreshExpiryDate', () => {
  it('returns a future date', () => {
    expect(getRefreshExpiryDate().getTime()).toBeGreaterThan(Date.now());
  });
});

describe('addDays', () => {
  it('advances the date by the given number of days', () => {
    const base = Date.now();
    const result = addDays(7).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    // Allow a small execution-time delta.
    expect(Math.abs(result - (base + sevenDaysMs))).toBeLessThan(5000);
  });
});
