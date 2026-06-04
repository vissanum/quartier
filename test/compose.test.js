import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { resolveRecipient } = await import('../outreach/compose.js');

// Fixture tree mirrors the real layout: projects/pipeline.json,
// projects/<id>/config.json, prospects/prospects.json. Generic names only.
const ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'recipient-root',
);

describe('resolveRecipient priority chain (override → config → pipeline → prospect)', () => {
  it('manual override beats every other source', () => {
    expect(resolveRecipient('cafe-imaginario', 'manual@operador.es', ROOT))
      .toBe('manual@operador.es');
  });

  it('curated project config beats the pipeline entry', () => {
    // cafe-imaginario has BOTH config.json email and pipeline email
    expect(resolveRecipient('cafe-imaginario', null, ROOT))
      .toBe('config@cafe-imaginario.com');
  });

  it('pipeline entry beats the enriched prospect', () => {
    // taller-generico has pipeline email AND a prospect email
    expect(resolveRecipient('taller-generico', null, ROOT))
      .toBe('pipeline@taller-generico.es');
  });

  it('falls back to the enriched prospect when nothing upstream has an email', () => {
    expect(resolveRecipient('peluqueria-generica', null, ROOT))
      .toBe('prospect@peluqueria-generica.es');
  });

  it('returns null (never a wrong guess) when no source has an email', () => {
    expect(resolveRecipient('fisio-generica', null, ROOT)).toBeNull();
  });

  it('returns null for a project that exists nowhere', () => {
    expect(resolveRecipient('no-existe', null, ROOT)).toBeNull();
  });
});
