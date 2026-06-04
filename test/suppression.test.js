import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Point the module at a throwaway file BEFORE importing it — the real
// suppression.json is a legal record and tests must never touch it.
process.env.QUARTIER_SUPPRESSION_FILE = path.join(
  mkdtempSync(path.join(tmpdir(), 'quartier-suppr-')),
  'suppression.json',
);
const { isSuppressed, addSuppression, removeSuppression, loadSuppressionList } =
  await import('../outreach/suppression.js');

describe('suppression gate (LSSI opt-out — the promise "no volveremos a escribirte")', () => {
  it('treats empty/unknown emails as not suppressed', () => {
    expect(isSuppressed('')).toBe(false);
    expect(isSuppressed(null)).toBe(false);
    expect(isSuppressed(undefined)).toBe(false);
    expect(isSuppressed('nadie@cafe-imaginario.com')).toBe(false);
  });

  it('suppresses after add, normalizing case and whitespace both ways', async () => {
    await addSuppression('  Maria@Cafe-Imaginario.COM ', 'BAJA');
    expect(isSuppressed('maria@cafe-imaginario.com')).toBe(true);
    expect(isSuppressed('MARIA@cafe-imaginario.COM')).toBe(true);
    expect(isSuppressed('  maria@cafe-imaginario.com  ')).toBe(true);
  });

  it('stores the normalized form, not the raw input', () => {
    const entry = loadSuppressionList().find((s) => s.email.includes('maria'));
    expect(entry.email).toBe('maria@cafe-imaginario.com');
    expect(entry.reason).toBe('BAJA');
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('never duplicates an entry on re-add (case-insensitive)', async () => {
    await addSuppression('MARIA@CAFE-IMAGINARIO.COM', 'BAJA otra vez');
    const matches = loadSuppressionList()
      .filter((s) => s.email === 'maria@cafe-imaginario.com');
    expect(matches).toHaveLength(1);
  });

  it('a different address on the same domain is NOT suppressed', () => {
    expect(isSuppressed('pedidos@cafe-imaginario.com')).toBe(false);
  });

  it('removeSuppression clears the entry', async () => {
    await addSuppression('temporal@taller-generico.es');
    expect(isSuppressed('temporal@taller-generico.es')).toBe(true);
    await removeSuppression('TEMPORAL@taller-generico.es');
    expect(isSuppressed('temporal@taller-generico.es')).toBe(false);
  });

  it('rejects adding an empty email', async () => {
    await expect(addSuppression('   ')).rejects.toThrow(/empty email/);
  });
});
