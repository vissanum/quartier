// Regression: deployed demo references must be ABSOLUTE. Hosting serves the
// showcase at <publicPath> with no trailing slash (cleanUrls), where a
// relative "assets/x.png" resolves one directory too high and 404s.
// Found by /qa on 2026-06-04 — every showcase screenshot and the "view
// redesign" button were broken in production.

import { describe, it, expect } from 'vitest';
import { rewriteShowcase, rewriteRedesignPage, scanIntegrity } from '../deploy/rewrite-paths';

const PUB = '/demos/talleres-garin';

describe('rewriteShowcase', () => {
  it('absolutizes original/ and redesign/ refs under the public path', () => {
    const html = `<html><head></head><body>
      <img src="original/screenshot-desktop.png">
      <img src="original/assets/logo.jpg">
      <a href="redesign/index.html">demo</a>
    </body></html>`;
    const out = rewriteShowcase(html, PUB);
    expect(out.html).toContain(`src="${PUB}/assets/screenshot-desktop.png"`);
    expect(out.html).toContain(`src="${PUB}/assets/logo.jpg"`); // assets/ prefix collapses
    expect(out.html).toContain(`href="${PUB}/demo/index.html"`);
    expect(out.originalAssets.sort()).toEqual(['assets/logo.jpg', 'screenshot-desktop.png']);
  });

  it('leaves external, anchor and already-absolute refs untouched, forces noindex', () => {
    const html = `<html><head><meta name="robots" content="index, follow"></head><body>
      <a href="https://example.com/x">ext</a>
      <a href="mailto:a@b.com">mail</a>
      <a href="#contacto">anchor</a>
      <link href="/favicon.svg" rel="icon">
    </body></html>`;
    const out = rewriteShowcase(html, PUB);
    expect(out.html).toContain('href="https://example.com/x"');
    expect(out.html).toContain('href="mailto:a@b.com"');
    expect(out.html).toContain('href="#contacto"');
    expect(out.html).toContain('href="/favicon.svg"');
    expect(out.html).toContain('content="noindex, nofollow"');
  });

  it('absolutizes CSS url() values in style blocks and style attributes', () => {
    const html = `<html><head><style>.hero{background:url('original/assets/bg.jpg')}</style></head>
      <body><div style="background-image: url(original/photo.png)">x</div></body></html>`;
    const out = rewriteShowcase(html, PUB);
    expect(out.html).toContain(`url('${PUB}/assets/bg.jpg')`);
    expect(out.html).toContain(`url(${PUB}/assets/photo.png)`);
    expect(out.originalAssets.sort()).toEqual(['assets/bg.jpg', 'photo.png']);
  });
});

describe('rewriteRedesignPage + scanIntegrity', () => {
  it('maps ../original escapes to shared assets and siblings under demo/', () => {
    const html = `<html><head></head><body>
      <img src="../original/assets/team.jpg">
      <a href="politica-privacidad.html">legal</a>
      <img src="assets/own.jpg">
    </body></html>`;
    const out = rewriteRedesignPage(html, PUB);
    expect(out.html).toContain(`src="${PUB}/assets/team.jpg"`);
    expect(out.html).toContain(`href="${PUB}/demo/politica-privacidad.html"`);
    expect(out.html).toContain(`src="${PUB}/demo/assets/own.jpg"`);

    // The safety net: any surviving relative ref aborts the deploy
    expect(scanIntegrity({ 'index.html': out.html })).toEqual([]);
    const offenders = scanIntegrity({ 'bad.html': '<img src="assets/x.png"><a href="../escape.html">x</a>' });
    expect(offenders.map((o) => o.ref).sort()).toEqual(['../escape.html', 'assets/x.png']);
  });
});
