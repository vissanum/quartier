import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Integration tests of the send.js GATE as a real subprocess: nothing here can
// reach the network — every case stops at preview mode or at the
// abort-on-warnings gate, which is exactly the behavior under test.

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEND = path.join(REPO, 'outreach', 'send.js');

function makeRoot({ email = 'dueno@cafe-imaginario.com', publicUrl = 'https://demos.example/cafe' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'quartier-send-'));
  mkdirSync(path.join(root, 'projects', 'cafe-imaginario'), { recursive: true });
  mkdirSync(path.join(root, 'prospects'), { recursive: true });
  const entry = {
    id: 'cafe-imaginario', nombre: 'Café Imaginario', tipo: 'cafetería',
    url: 'https://www.cafe-imaginario.com', ciudad: 'Bilbao', fase: 'propuesta',
    fechaInicio: '2026-06-01', ultimaAccion: '2026-06-01', showcaseUrl: '',
    presupuesto: null, cobrado: false, notas: '',
  };
  if (email) entry.email = email;
  if (publicUrl) entry.publicUrl = publicUrl;
  writeFileSync(path.join(root, 'projects', 'pipeline.json'), JSON.stringify([entry], null, 2));
  writeFileSync(path.join(root, 'prospects', 'prospects.json'), '[]\n');
  return root;
}

function runSend(root, args, suppressionFile) {
  const res = spawnSync('node', [SEND, ...args], {
    cwd: root,
    env: {
      ...process.env,
      QUARTIER_SUPPRESSION_FILE: suppressionFile
        || path.join(root, 'suppression-empty.json'),
    },
    encoding: 'utf-8',
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

describe('send.js gate (subprocess — no email can leave these tests)', () => {
  it('defaults to preview: exit 0 and nothing sent without --send', () => {
    const root = makeRoot();
    const { code, stdout } = runSend(root, ['cafe-imaginario']);
    expect(code).toBe(0);
    expect(stdout).toContain('Preview only');
    expect(stdout).toContain('dueno@cafe-imaginario.com');
  });

  it('with --send, aborts (exit 1) when any warning exists — e.g. no recipient', () => {
    const root = makeRoot({ email: null });
    const { code, stdout, stderr } = runSend(root, ['cafe-imaginario', '--send']);
    expect(code).toBe(1);
    expect(stdout + stderr).toContain('No recipient email');
    expect(stderr).toContain('Not sending');
  });

  it('with --send, the suppression gate blocks a BAJA address before anything leaves', () => {
    const root = makeRoot();
    const suppression = path.join(root, 'suppression.json');
    writeFileSync(suppression, JSON.stringify([
      { email: 'dueno@cafe-imaginario.com', date: '2026-06-01T10:00:00Z', reason: 'BAJA' },
    ]));
    const { code, stdout, stderr } = runSend(root, ['cafe-imaginario', '--send'], suppression);
    expect(code).toBe(1);
    expect(stdout + stderr).toContain('lista de supresión');
    expect(stderr).toContain('Not sending');
  });

  it('the suppression gate also blocks --to overrides (BAJA is forever, no backdoors)', () => {
    const root = makeRoot();
    const suppression = path.join(root, 'suppression.json');
    writeFileSync(suppression, JSON.stringify([
      { email: 'baja@taller-generico.es', date: '2026-06-01T10:00:00Z', reason: 'BAJA' },
    ]));
    const { code, stdout, stderr } = runSend(
      root, ['cafe-imaginario', '--to', 'BAJA@taller-generico.es', '--send'], suppression);
    expect(code).toBe(1);
    expect(stdout + stderr).toContain('lista de supresión');
  });

  it('preview shows the suppression warning too, so the operator sees it early', () => {
    const root = makeRoot();
    const suppression = path.join(root, 'suppression.json');
    writeFileSync(suppression, JSON.stringify([
      { email: 'dueno@cafe-imaginario.com', date: '2026-06-01T10:00:00Z', reason: 'BAJA' },
    ]));
    const { code, stdout, stderr } = runSend(root, ['cafe-imaginario'], suppression);
    expect(code).toBe(0); // preview never exits non-zero
    expect(stdout + stderr).toContain('lista de supresión');
  });
});
