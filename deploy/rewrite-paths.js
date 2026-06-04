// Rewrites relative references when a project's showcase and redesign are
// flattened into the public deploy layout:
//   public/webs/<slug>/index.html    ← showcase.html
//   public/webs/<slug>/demo/*.html   ← redesign/*.html
//   public/webs/<slug>/assets/*      ← referenced files from original/

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

function rewriteAttrs($, mapFn) {
  for (const [tag, attr] of REWRITE_TARGETS) {
    $(`${tag}[${attr}]`).each((_, el) => {
      const val = $(el).attr(attr);
      if (!val || EXTERNAL.test(val)) return;
      const next = mapFn(val);
      if (next && next !== val) $(el).attr(attr, next);
    });
  }
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

// showcase.html → <slug>/index.html
function rewriteShowcase(html) {
  const $ = cheerio.load(html);
  const originalAssets = new Set();
  rewriteAttrs($, (val) => {
    const orig = val.match(/^original\/(.+)$/);
    if (orig) {
      originalAssets.add(orig[1]);
      return 'assets/' + toAssetPath(orig[1]);
    }
    if (val.startsWith('redesign/')) return 'demo/' + val.slice('redesign/'.length);
    return val;
  });
  ensureNoindex($);
  return { html: $.html(), originalAssets: [...originalAssets] };
}

// redesign/<page>.html → <slug>/demo/<page>.html
// Same-dir links (sibling pages, own assets/) survive the move unchanged;
// only the "../original/…" escape needs remapping.
function rewriteRedesignPage(html) {
  const $ = cheerio.load(html);
  const originalAssets = new Set();
  rewriteAttrs($, (val) => {
    const esc = val.match(/^\.\.\/original\/(.+)$/);
    if (esc) {
      originalAssets.add(esc[1]);
      return '../assets/' + toAssetPath(esc[1]);
    }
    return val;
  });
  ensureNoindex($);
  return { html: $.html(), originalAssets: [...originalAssets] };
}

// Post-rewrite safety net: no deployed HTML may still reference original/ or
// redesign/, and nothing may escape the slug dir. Checks src/href attributes
// and CSS url(...) values. Returns offending refs (empty array = clean).
function scanIntegrity(htmlByFile) {
  const offenders = [];
  const REF = /(?:src|href)=["']([^"']+)["']|url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  for (const [file, html] of Object.entries(htmlByFile)) {
    const inDemo = file.startsWith('demo/') || file.includes(`demo${path.sep}`);
    let m;
    while ((m = REF.exec(html)) !== null) {
      const ref = (m[1] || m[2] || '').trim();
      if (!ref || EXTERNAL.test(ref)) continue;
      const referencesSource = /(^|\/)original\//.test(ref) || /(^|\/)redesign\//.test(ref);
      // demo pages may go up exactly one level into assets/; nothing else may climb
      const escapes = inDemo ? /^\.\.\/(?!assets\/)/.test(ref) : ref.startsWith('../');
      if (referencesSource || escapes) offenders.push({ file, ref });
    }
  }
  return offenders;
}

module.exports = { rewriteShowcase, rewriteRedesignPage, scanIntegrity, toAssetPath };
