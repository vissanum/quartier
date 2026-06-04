import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { buildPages } = await import('../deploy/publish.js');

// buildPages is the validation half of publish: it must refuse to build a demo
// that would reach production broken. These tests pin its abort contract.

const PAGE = (body) => `<!DOCTYPE html>
<html lang="es"><head><title>Café Imaginario</title></head>
<body>${body}</body></html>\n`;

function makeProject({ showcase = true, redesign = true, body = '<h1>Hola</h1>' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'quartier-publish-'));
  const dir = path.join(root, 'projects', 'cafe-imaginario');
  mkdirSync(path.join(dir, 'redesign'), { recursive: true });
  mkdirSync(path.join(dir, 'original'), { recursive: true });
  if (showcase) writeFileSync(path.join(dir, 'showcase.html'), PAGE('<p>antes/después</p>'));
  if (redesign) writeFileSync(path.join(dir, 'redesign', 'index.html'), PAGE(body));
  return root;
}

describe('publish buildPages (refuse to build a broken demo)', () => {
  it('aborts when showcase.html is missing (the batch-1 B1 blocker)', () => {
    const root = makeProject({ showcase: false });
    expect(() => buildPages('cafe-imaginario', '/demos/cafe-imaginario', root))
      .toThrow(/showcase\.html/);
  });

  it('aborts when redesign/index.html is missing', () => {
    const root = makeProject({ redesign: false });
    expect(() => buildPages('cafe-imaginario', '/demos/cafe-imaginario', root))
      .toThrow(/redesign\/index\.html/);
  });

  it('builds the happy path: showcase → index, redesign → demo pages', () => {
    const root = makeProject();
    const built = buildPages('cafe-imaginario', '/demos/cafe-imaginario', root);
    expect(built.showcase.html).toContain('antes/después');
    expect(Object.keys(built.demoPages)).toContain('index.html');
    expect(built.demoPages['index.html']).toContain('<h1>Hola</h1>');
  });

  it('aborts when a page references a missing original/ asset', () => {
    const root = makeProject({ body: '<img src="../original/assets/foto.jpg" alt="foto">' });
    expect(() => buildPages('cafe-imaginario', '/demos/cafe-imaginario', root))
      .toThrow(/missing file|unresolved relative/i);
  });
});
