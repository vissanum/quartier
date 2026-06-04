#!/usr/bin/env node
// Publish a project's demo. Two delivery modes, chosen by deploy.mode in
// config.operator.json:
//
//   "git" (default)  — copy into <deploy.repoPath>/public/webs/<slug>/,
//                      commit + push; the website repo's CI deploys it.
//                      Demo URL: <webBaseUrl>/webs/<slug>
//   "firebase"       — copy into the local demos workspace and release the
//                      dedicated Firebase Hosting site directly (seconds,
//                      no git, no CI). Demo URL: <firebase.baseUrl>/<slug>
//
// Build is identical in both modes: showcase.html → index.html, redesign/ →
// demo/, referenced original/ assets → assets/, paths rewritten, integrity-
// scanned, noindex enforced, tracking injected.
//
// Usage:
//   node deploy/publish.js <project-name> [--no-push]
//
// --no-push builds the target layout but skips delivery (git: no commit/push;
// firebase: no deploy) so it can be inspected first.

const fs = require('fs');
const path = require('path');
const config = require('../lib/load-env');
const { loadJSON, updateJSON } = require('../lib/json-store');
const { rewriteShowcase, rewriteRedesignPage, scanIntegrity, toAssetPath } = require('./rewrite-paths');
const { trackingSnippet, injectTracking } = require('./tracking');
const { assertRepoReady, commitAndPush } = require('./git-host');
const firebaseHost = require('./firebase-host');

// ── Build: validate sources and produce the rewritten page set ─────────────

function buildPages(projectId, publicPath, root = process.cwd()) {
  const projectDir = path.join(root, 'projects', projectId);
  const showcasePath = path.join(projectDir, 'showcase.html');
  const redesignDir = path.join(projectDir, 'redesign');
  const originalDir = path.join(projectDir, 'original');

  if (!fs.existsSync(path.join(redesignDir, 'index.html'))) {
    throw new Error(`Missing projects/${projectId}/redesign/index.html — generate the redesign first`);
  }

  // Showcase (the before/after page) is OPTIONAL: with it, it becomes the
  // slug's index and the demo lives under /demo/; without it, the slug root
  // redirects straight to the demo. Demos stay noindex + link-only either way.
  const neededAssets = new Set();
  let showcase = null;
  if (fs.existsSync(showcasePath)) {
    showcase = rewriteShowcase(fs.readFileSync(showcasePath, 'utf-8'), publicPath);
    showcase.originalAssets.forEach((a) => neededAssets.add(a));
  }

  const demoPages = {};
  const redesignEntries = fs.readdirSync(redesignDir, { withFileTypes: true });
  for (const entry of redesignEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const page = rewriteRedesignPage(fs.readFileSync(path.join(redesignDir, entry.name), 'utf-8'), publicPath);
    page.originalAssets.forEach((a) => neededAssets.add(a));
    demoPages[entry.name] = page.html;
  }

  for (const rel of neededAssets) {
    if (!fs.existsSync(path.join(originalDir, rel))) {
      throw new Error(`Showcase/redesign references a missing file: original/${rel}`);
    }
  }

  // Integrity scan — a broken demo must never reach production
  const htmlByFile = {};
  if (showcase) htmlByFile['index.html'] = showcase.html;
  for (const [name, html] of Object.entries(demoPages)) htmlByFile[`demo/${name}`] = html;
  const offenders = scanIntegrity(htmlByFile);
  if (offenders.length) {
    const list = offenders.map((o) => `  ${o.file}: ${o.ref}`).join('\n');
    throw new Error(`Deploy aborted — unresolved relative references:\n${list}`);
  }

  return { showcase, demoPages, neededAssets, redesignDir, originalDir, redesignEntries, publicPath };
}

// ── Write: lay the built demo out under target/ (fresh, fully owned) ───────

function writeSlugDir(target, slug, built, { log }) {
  const { showcase, demoPages, neededAssets, redesignDir, originalDir, redesignEntries } = built;
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.join(target, 'demo'), { recursive: true });

  // Visit tracking goes into every published page (showcase + demo pages).
  // No tracking config → empty snippet → pages publish untouched.
  const snippet = trackingSnippet(config, slug);
  if (snippet) log(`[deploy] tracking snippet injected (${config.tracking.provider})`);

  if (showcase) {
    fs.writeFileSync(path.join(target, 'index.html'), injectTracking(showcase.html, snippet));
  } else {
    // No before/after page: the slug root bounces straight to the demo.
    // Absolute URL on purpose — cleanUrls serves /x/index.html at /x (no
    // trailing slash), so a relative "demo/" would resolve a directory up.
    const demoUrl = `${built.publicPath}/demo/`;
    fs.writeFileSync(path.join(target, 'index.html'), `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url=${demoUrl}">
<title>Demo</title></head>
<body><p><a href="${demoUrl}">Ver la demo</a></p></body></html>\n`);
  }
  for (const [name, html] of Object.entries(demoPages)) {
    fs.writeFileSync(path.join(target, 'demo', name), injectTracking(html, snippet));
  }
  // Non-HTML redesign content (own assets/, PDFs…) copies verbatim into demo/
  for (const entry of redesignEntries) {
    if (entry.isFile() && entry.name.endsWith('.html')) continue;
    fs.cpSync(path.join(redesignDir, entry.name), path.join(target, 'demo', entry.name), { recursive: true });
  }
  for (const rel of neededAssets) {
    const dest = path.join(target, 'assets', toAssetPath(rel));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(originalDir, rel), dest);
  }
  log(`[deploy] wrote ${target} (${Object.keys(demoPages).length} demo pages, ${neededAssets.size} shared assets)`);
}

// ── Delivery modes ──────────────────────────────────────────────────────────

function deliverGit(projectId, built, { push, log }) {
  const root = process.cwd();
  const { repoPath, branch, webBaseUrl } = config.deploy;
  if (!repoPath || !webBaseUrl) {
    throw new Error('config.operator.json is missing deploy.repoPath / deploy.webBaseUrl');
  }
  const repo = path.resolve(root, repoPath);
  const publicDir = path.join(repo, 'public');
  if (!fs.existsSync(publicDir)) throw new Error(`Deploy repo has no public/ directory: ${publicDir}`);

  const slug = projectId;
  // On the shared /webs section a project slug could shadow operator pages
  // (landing, intake…). 'index' and 'assets' are always reserved; operator
  // pages are listed in deploy.reservedSlugs.
  const reserved = ['index', 'assets', ...(config.deploy.reservedSlugs || [])];
  if (reserved.includes(slug)) {
    throw new Error(`"${slug}" is a reserved name in /webs (see deploy.reservedSlugs) — rename the project`);
  }

  assertRepoReady(repo, branch);
  writeSlugDir(path.join(publicDir, 'webs', slug), slug, built, { log });

  const pipeline = loadJSON(path.join(root, 'projects', 'pipeline.json'), []);
  const entry = pipeline.find((p) => p.id === projectId);
  const result = commitAndPush(repo, {
    pathspec: path.posix.join('public', 'webs', slug),
    subject: `Deploy redesign demo: ${entry ? entry.nombre : slug} (${slug})`,
    coAuthor: config.coAuthor,
    branch,
    push,
    log,
  });

  // No trailing slash: Firebase (cleanUrls + trailingSlash:false) 301s "/x/" → "/x"
  const publicUrl = `${webBaseUrl}/webs/${slug}`;
  const liveNote = result.pushed ? ' (live once CI finishes)' : ' (NOT pushed)';
  return { publicUrl, liveNote, ...result };
}

function deliverFirebase(projectId, built, { push, log }) {
  const slug = projectId;
  firebaseHost.ensureWorkspace(config, { log });
  writeSlugDir(firebaseHost.slugTarget(config, slug), slug, built, { log });

  let deployed = false;
  if (push) {
    firebaseHost.deploySite(config, { log });
    deployed = true;
  }
  const publicUrl = firebaseHost.demoUrl(config, slug);
  const liveNote = deployed ? ' (live now)' : ' (built, NOT deployed — run without --no-push)';
  return { publicUrl, liveNote, committed: deployed, pushed: deployed };
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function publish(projectId, { push = true, log = console.log } = {}) {
  const mode = (config.deploy && config.deploy.mode) || 'git';
  if (mode !== 'git' && mode !== 'firebase') {
    throw new Error(`Unknown deploy.mode "${mode}" in config.operator.json (expected "git" or "firebase")`);
  }

  // Rewritten references are absolute, so the build must know where the
  // slug will be mounted on its host.
  const fbSub = mode === 'firebase' ? (config.deploy.firebase.demosPath || '').replace(/^\/+|\/+$/g, '') : '';
  const publicPath = mode === 'firebase'
    ? `${fbSub ? `/${fbSub}` : ''}/${projectId}`
    : `/webs/${projectId}`;

  const built = buildPages(projectId, publicPath);
  const result = mode === 'firebase'
    ? deliverFirebase(projectId, built, { push, log })
    : deliverGit(projectId, built, { push, log });

  // Record the public URL in the pipeline. Without a showcase the link that
  // goes to the prospect is the demo itself; showcaseUrl stays empty so the
  // teardown pitch (variant a) knows it has no before/after page to cite.
  const publicUrl = built.showcase ? result.publicUrl : `${result.publicUrl}/demo`;
  await updateJSON(path.join(process.cwd(), 'projects', 'pipeline.json'), (entries) => {
    const item = (entries || []).find((p) => p.id === projectId);
    if (!item) {
      log(`[deploy] warning: no pipeline entry for "${projectId}" — publicUrl not recorded`);
      return entries || [];
    }
    item.publicUrl = publicUrl;
    item.showcaseUrl = built.showcase ? result.publicUrl : '';
    item.ultimaAccion = new Date().toISOString().slice(0, 10);
  }, []);

  log(`[deploy] public URL: ${publicUrl}${result.liveNote}`);
  return { publicUrl, committed: result.committed, pushed: result.pushed };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const projectId = args.find((a) => !a.startsWith('--'));
  if (!projectId) {
    console.error('Usage: node deploy/publish.js <project-name> [--no-push]');
    process.exit(1);
  }
  publish(projectId, { push: !args.includes('--no-push') }).catch((err) => {
    console.error(`[deploy] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { publish, buildPages };
