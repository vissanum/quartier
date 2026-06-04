// Rewrites references when a project's showcase and redesign are flattened
// into the public deploy layout under a known public path:
//   <publicPath>/index.html    ← showcase.html
//   <publicPath>/demo/*.html   ← redesign/*.html
//   <publicPath>/assets/*      ← referenced files from original/
//
// All rewritten references are ABSOLUTE (rooted at publicPath). Hosting
// serves the showcase as <publicPath> with no trailing slash (cleanUrls +
// trailingSlash:false), where a relative "assets/x.png" would resolve one
// directory too high and 404 — absolute paths are immune to how the URL
// is spelled. Project sources keep their relative links for local review;
// only the deployed copies are rewritten.

const path = require('path');
const cheerio = require('cheerio');

// Only these attributes are rewritten — keep the surface small and predictable
const REWRITE_TARGETS = [
  ['img', 'src'],
  ['a', 'href'],
  ['link', 'href'],
  ['script', 'src'],
];

const EXTERNAL = /^(https?:|mailto:|tel:|data:|#|\/\/)/i;

// Path under original/ → path under the deployed assets/ dir.
// "assets/0_office.jpg" → "0_office.jpg", "screenshot-desktop.png" stays,
// deeper structure is preserved ("assets/google/photo.jpg" → "google/photo.jpg").
function toAssetPath(relUnderOriginal) {
  return relUnderOriginal.startsWith('assets/')
    ? relUnderOriginal.slice('assets/'.length)
    : relUnderOriginal;
}

// Split off ?query/#fragment so path normalization never mangles them.
function splitSuffix(ref) {
  const m = ref.match(/^([^?#]*)([?#].*)?$/);
  return { base: m[1], suffix: m[2] || '' };
}

function absolutize(pageDir, ref) {
  const { base, suffix } = splitSuffix(ref);
  if (!base) return ref; // pure "#anchor" handled by EXTERNAL anyway
  return path.posix.normalize(`${pageDir}/${base}`) + suffix;
}

function rewriteAttrs($, mapFn) {
  for (const [tag, attr] of REWRITE_TARGETS) {
    $(`${tag}[${attr}]`).each((_, el) => {
      const val = $(el).attr(attr);
      if (!val || EXTERNAL.test(val) || val.startsWith('/')) return;
      const next = mapFn(val);
      if (next && next !== val) $(el).attr(attr, next);
    });
  }
  // CSS url(...) values — inline <style> blocks and style="" attributes —
  // resolve relative to the page URL exactly like attributes do, so they
  // need the same absolutization.
  const rewriteCss = (css) => css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, q, ref) => {
    if (!ref || EXTERNAL.test(ref) || ref.startsWith('/')) return full;
    const next = mapFn(ref);
    return next && next !== ref ? `url(${q}${next}${q})` : full;
  });
  $('style').each((_, el) => {
    const css = $(el).html();
    if (css && css.includes('url(')) {
      const next = rewriteCss(css);
      if (next !== css) $(el).html(next);
    }
  });
  $('[style*="url("]').each((_, el) => {
    const next = rewriteCss($(el).attr('style'));
    if (next !== $(el).attr('style')) $(el).attr('style', next);
  });
}

// Demos must never be indexed — they live on the operator's domain
function ensureNoindex($) {
  const meta = $('meta[name="robots"]');
  if (meta.length === 0) {
    $('head').prepend('<meta name="robots" content="noindex, nofollow">\n');
  } else {
    meta.attr('content', 'noindex, nofollow');
  }
}

// showcase.html → <publicPath>/index.html
function rewriteShowcase(html, publicPath) {
  const $ = cheerio.load(html);
  const originalAssets = new Set();
  rewriteAttrs($, (val) => {
    const orig = val.match(/^original\/(.+)$/);
    if (orig) {
      originalAssets.add(splitSuffix(orig[1]).base);
      return `${publicPath}/assets/${toAssetPath(orig[1])}`;
    }
    if (val.startsWith('redesign/')) return `${publicPath}/demo/${val.slice('redesign/'.length)}`;
    return absolutize(publicPath, val);
  });
  ensureNoindex($);
  return { html: $.html(), originalAssets: [...originalAssets] };
}

// redesign/<page>.html → <publicPath>/demo/<page>.html
// Sibling links and the page's own assets/ resolve under demo/; the
// "../original/…" escape remaps into the shared assets/ dir.
function rewriteRedesignPage(html, publicPath) {
  const $ = cheerio.load(html);
  const originalAssets = new Set();
  rewriteAttrs($, (val) => {
    const esc = val.match(/^\.\.\/original\/(.+)$/);
    if (esc) {
      originalAssets.add(splitSuffix(esc[1]).base);
      return `${publicPath}/assets/${toAssetPath(esc[1])}`;
    }
    return absolutize(`${publicPath}/demo`, val);
  });
  ensureNoindex($);
  return { html: $.html(), originalAssets: [...originalAssets] };
}

// Post-rewrite safety net. After absolutization, NO relative reference may
// survive in src/href attributes or CSS url(...) values, and nothing may
// still point at original/ or redesign/ sources. Returns offending refs
// (empty array = clean).
function scanIntegrity(htmlByFile) {
  const offenders = [];
  const REF = /(?:src|href)=["']([^"']+)["']|url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  for (const [file, html] of Object.entries(htmlByFile)) {
    let m;
    while ((m = REF.exec(html)) !== null) {
      const ref = (m[1] || m[2] || '').trim();
      if (!ref || EXTERNAL.test(ref)) continue;
      const referencesSource = /(^|\/)original\//.test(ref) || /(^|\/)redesign\//.test(ref);
      // CSS url(...) inside <style> stays relative-safe only if absolute too;
      // any non-absolute leftover would break on the slash-less URL.
      const stillRelative = !ref.startsWith('/');
      if (referencesSource || stillRelative) offenders.push({ file, ref });
    }
  }
  return offenders;
}

module.exports = { rewriteShowcase, rewriteRedesignPage, scanIntegrity, toAssetPath };
