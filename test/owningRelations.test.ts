import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without type declarations
import { owningRelationsFromSchema, renderOwningRelations } from '../scripts/gen-owning-relations.mjs';

describe('owning relations map used by the tenant extension', () => {
  it('matches prisma/schema.prisma (run `npm run prisma:generate` after a schema change)', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const committed = readFileSync('src/generated/owningRelations.ts', 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(renderOwningRelations(owningRelationsFromSchema(schema)));
  });

  it('lists only foreign-key relations, not back-relation lists', () => {
    const map = owningRelationsFromSchema(readFileSync('prisma/schema.prisma', 'utf8'));
    expect(map.CatalogItem).toEqual(['department', 'facility']);
    expect(map.Claim).toContain('vettedBy');
    expect(map.Claim).not.toContain('lines');
  });
});
