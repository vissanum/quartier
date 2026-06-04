import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { runBackup, DEFAULT_SOURCES } = await import('../tools/backup.js');

function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'quartier-backup-'));
  mkdirSync(path.join(root, 'projects'), { recursive: true });
  mkdirSync(path.join(root, 'outreach'), { recursive: true });
  writeFileSync(path.join(root, 'projects', 'pipeline.json'), '[{"id":"cafe-imaginario"}]\n');
  writeFileSync(path.join(root, 'outreach', 'suppression.json'),
    '[{"email":"baja@taller-generico.es","date":"2026-06-04T10:00:00Z","reason":"BAJA"}]\n');
  // prospects/* deliberately absent — must be reported as skipped, not crash
  return root;
}

describe('tools/backup.js (the legal record must survive a deleted working tree)', () => {
  it('copies existing sources preserving relative paths, byte-identical', () => {
    const root = makeRoot();
    const { dir, copied, skipped } = runBackup({ root });

    expect(copied).toContain('projects/pipeline.json');
    expect(copied).toContain('outreach/suppression.json');
    expect(skipped).toContain('prospects/prospects.json');
    expect(skipped).toContain('prospects/searches.json');

    const original = readFileSync(path.join(root, 'outreach', 'suppression.json'), 'utf-8');
    const backup = readFileSync(path.join(dir, 'outreach', 'suppression.json'), 'utf-8');
    expect(backup).toBe(original);
  });

  it('defaults the destination to backups/<timestamp> under the root', () => {
    const root = makeRoot();
    const { dir } = runBackup({ root, date: new Date('2026-06-04T21:30:00Z') });
    expect(dir).toBe(path.join(root, 'backups', '2026-06-04_21-30-00'));
    expect(existsSync(path.join(dir, 'projects', 'pipeline.json'))).toBe(true);
  });

  it('honors an explicit --out directory', () => {
    const root = makeRoot();
    const out = path.join(root, 'custom-dest');
    const { dir } = runBackup({ root, outDir: out });
    expect(dir).toBe(out);
    expect(existsSync(path.join(out, 'outreach', 'suppression.json'))).toBe(true);
  });

  it('covers every operational record in DEFAULT_SOURCES', () => {
    expect(DEFAULT_SOURCES).toEqual(expect.arrayContaining([
      'projects/pipeline.json',
      'outreach/suppression.json',
      'prospects/prospects.json',
      'prospects/searches.json',
    ]));
  });
});
