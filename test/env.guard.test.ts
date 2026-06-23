import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envModule = path.resolve(__dirname, '../src/config/env.ts');

/**
 * Attempts to import the env module in a fresh process with the given env vars.
 * Returns { ok: true } if it loaded, or { ok: false, stderr } if it threw.
 *
 * Uses tsx to run the TypeScript module directly. The import alone triggers the
 * env schema validation, which throws on invalid configuration.
 */
function loadEnvWith(vars: Record<string, string>): { ok: boolean; stderr: string } {
  // Use a file:// URL so dynamic import works cross-platform. On Windows a bare
  // absolute path ("C:\\...") is parsed as a URL with scheme "c:" and rejected
  // by the ESM loader (ERR_UNSUPPORTED_ESM_URL_SCHEME).
  const code = `import(${JSON.stringify(pathToFileURL(envModule).href)}).then(() => process.exit(0)).catch(() => process.exit(1));`;
  try {
    execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
      env: { ...vars, PATH: process.env.PATH ?? '' },
      stdio: ['ignore', 'ignore', 'pipe']
    });
    return { ok: true, stderr: '' };
  } catch (error: any) {
    return { ok: false, stderr: String(error?.stderr ?? '') };
  }
}

const validProdSecrets = {
  JWT_ACCESS_SECRET: 'a-very-long-production-access-secret-value-32+',
  JWT_REFRESH_SECRET: 'a-different-long-production-refresh-secret-32+'
};

describe('env production secret guard', () => {
  it('accepts strong, distinct secrets in production', () => {
    const result = loadEnvWith({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      ...validProdSecrets
    });
    expect(result.ok).toBe(true);
  });

  it('rejects the default access secret in production', () => {
    const result = loadEnvWith({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_ACCESS_SECRET: 'change-this-access-secret',
      JWT_REFRESH_SECRET: validProdSecrets.JWT_REFRESH_SECRET
    });
    expect(result.ok).toBe(false);
  });

  it('rejects identical access and refresh secrets in production', () => {
    const shared = 'identical-secret-that-is-definitely-long-enough-32';
    const result = loadEnvWith({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_ACCESS_SECRET: shared,
      JWT_REFRESH_SECRET: shared
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a too-short secret in production', () => {
    const result = loadEnvWith({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_ACCESS_SECRET: 'short',
      JWT_REFRESH_SECRET: validProdSecrets.JWT_REFRESH_SECRET
    });
    expect(result.ok).toBe(false);
  });

  it('allows default secrets outside production (developer convenience)', () => {
    const result = loadEnvWith({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db'
    });
    expect(result.ok).toBe(true);
  });

  it('requires DATABASE_URL in every environment', () => {
    const result = loadEnvWith({
      NODE_ENV: 'development'
    });
    expect(result.ok).toBe(false);
  });
});
