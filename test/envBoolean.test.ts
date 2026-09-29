import { describe, expect, it } from 'vitest';
import { envBoolean } from '../src/config/env.js';

// Found in the Phase 7 review: z.coerce.boolean() read TRUST_PROXY=false as true.
describe('true/false settings', () => {
  it('reads the usual spellings', () => {
    for (const v of ['true', 'TRUE', '1', 'yes', 'on', ' true ']) expect(envBoolean.parse(v), v).toBe(true);
    for (const v of ['false', 'False', '0', 'no', 'off', '']) expect(envBoolean.parse(v), v).toBe(false);
    expect(envBoolean.parse(true)).toBe(true);
    expect(envBoolean.parse(false)).toBe(false);
  });

  it('refuses anything else instead of guessing', () => {
    expect(envBoolean.safeParse('flase').success).toBe(false);
    expect(envBoolean.safeParse('2').success).toBe(false);
  });

  it('keeps defaults', () => {
    expect(envBoolean.default(true).parse(undefined)).toBe(true);
    expect(envBoolean.default(false).parse(undefined)).toBe(false);
  });
});
