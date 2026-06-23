import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/utils/password.js';

describe('password hashing', () => {
  it('produces a hash that differs from the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('S3cure!Pass');
    await expect(verifyPassword('S3cure!Pass', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('S3cure!Pass');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('rejects a near-miss (case sensitivity)', async () => {
    const hash = await hashPassword('CaseSensitive');
    await expect(verifyPassword('casesensitive', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same password (unique salts)', async () => {
    const a = await hashPassword('samePassword');
    const b = await hashPassword('samePassword');
    expect(a).not.toBe(b);
    // ...but both still verify correctly.
    await expect(verifyPassword('samePassword', a)).resolves.toBe(true);
    await expect(verifyPassword('samePassword', b)).resolves.toBe(true);
  });

  it('uses a bcrypt hash with cost factor 12', async () => {
    const hash = await hashPassword('whatever');
    // bcrypt format: $2<a|b>$<cost>$...
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });
});
