import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { resolveVariant, FIRST_CONTACT_VARIANTS, TEMPLATE_TO_VARIANT } =
  await import('../outreach/variants.js');

// Stickiness protects the A/B read: if a prospect's pitch flips between sends,
// the batch-1 experiment data is contaminated.
function rootWith(pipeline) {
  const root = mkdtempSync(path.join(tmpdir(), 'quartier-variants-'));
  mkdirSync(path.join(root, 'projects'), { recursive: true });
  writeFileSync(path.join(root, 'projects', 'pipeline.json'),
    JSON.stringify(pipeline, null, 2));
  return root;
}

describe('resolveVariant (A/B assignment: sticky → explicit → auto-balance)', () => {
  it('stays sticky on the prior variant even when another is forced', () => {
    const root = rootWith([
      { id: 'cafe-imaginario', outreach: [{ variant: 'a', date: '2026-06-01' }] },
    ]);
    expect(resolveVariant('cafe-imaginario', 'b', root))
      .toEqual({ variant: 'a', sticky: true });
  });

  it('derives the sticky variant from a logged template name when variant is absent', () => {
    const [templateOfB] = Object.entries(FIRST_CONTACT_VARIANTS)
      .find(([v]) => v === 'b');
    const tplName = FIRST_CONTACT_VARIANTS.b;
    expect(TEMPLATE_TO_VARIANT[tplName]).toBe('b'); // sanity on the mapping itself
    const root = rootWith([
      { id: 'taller-generico', outreach: [{ template: tplName }] },
    ]);
    expect(resolveVariant('taller-generico', null, root))
      .toEqual({ variant: 'b', sticky: true });
    void templateOfB;
  });

  it('honors an explicit variant when there is no prior send', () => {
    const root = rootWith([{ id: 'fisio-generica' }]);
    expect(resolveVariant('fisio-generica', 'b', root))
      .toEqual({ variant: 'b', sticky: false });
  });

  it('auto-balances toward the under-assigned variant across the pipeline', () => {
    const root = rootWith([
      { id: 'p1', outreach: [{ variant: 'a' }] },
      { id: 'p2', outreach: [{ variant: 'a' }] },
      { id: 'p3', outreach: [{ variant: 'b' }] },
      { id: 'nuevo' },
    ]);
    expect(resolveVariant('nuevo', null, root))
      .toEqual({ variant: 'b', sticky: false });
  });

  it('breaks ties toward "a" (the control)', () => {
    const root = rootWith([
      { id: 'p1', outreach: [{ variant: 'a' }] },
      { id: 'p2', outreach: [{ variant: 'b' }] },
      { id: 'nuevo' },
    ]);
    expect(resolveVariant('nuevo', null, root))
      .toEqual({ variant: 'a', sticky: false });
  });

  it('assigns "a" on a completely fresh pipeline', () => {
    const root = rootWith([{ id: 'nuevo' }]);
    expect(resolveVariant('nuevo', null, root))
      .toEqual({ variant: 'a', sticky: false });
  });
});
