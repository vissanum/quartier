#!/usr/bin/env node
// Publish a project's demo to the public website repo.
//
// Copies showcase.html (→ index.html) and redesign/ (→ demo/) into
// <deploy.repoPath>/public/webs/<slug>/, rewrites relative paths, commits the
// slug directory and pushes so the website CI deploys it.
//
// Usage:
//   node deploy/publish.js <project-name> [--no-push]

const fs = require('fs');
const path = require('path');
const config = require('../lib/load-env');
const { loadJSON, updateJSON } = require('../lib/json-store');
const { rewriteShowcase, rewriteRedesignPage, scanIntegrity, toAssetPath } = require('./rewrite-paths');
const { trackingSnippet, injectTracking } = require('./tracking');
const { assertRepoReady, commitAndPush } = require('./git-host');

async function publish(projectId, { push = true, log = console.log } = {}) {
  const root = process.cwd();
  const projectDir = path.join(root, 'projects', projectId);
  const showcasePath = path.join(projectDir, 'showcase.html');
  const redesignDir = path.join(projectDir, 'redesign');
  const originalDir = path.join(projectDir, 'original');
  const pipelinePath = path.join(root, 'projects', 'pipeline.json');

  // 1. Validate configuration and sources before touching anything
  const { repoPath, branch, webBaseUrl } = config.deploy;
  if (!repoPath || !webBaseUrl) {
    throw new Error('config.operator.json is missing deploy.repoPath / deploy.webBaseUrl');
  }
  const repo = path.resolve(root, repoPath);
  const publicDir = path.join(repo, 'public');
  if (!fs.existsSync(publicDir)) throw new Error(`Deploy repo has no public/ directory: ${publicDir}`);
  if (!fs.existsSync(showcasePath)) {
    throw new Error(`Missing projects/${projectId}/showcase.html — generate the showcase first (PLAYBOOK step 9)`);
  }
  if (!fs.existsSync(path.join(redesignDir, 'index.html'))) {
    throw new Error(`Missing projects/${projectId}/redesign/index.html — generate the redesign first`);
  }

  assertRepoReady(repo, branch);

  // 2. Rewrite HTML and collect every original/ asset it references
  const neededAssets = new Set();
  const showcase = rewriteShowcase(fs.readFileSync(showcasePath, 'utf-8'));
  showcase.originalAssets.forEach((a) => neededAssets.add(a));

  const demoPages = {};
  const redesignEntries = fs.readdirSync(redesignDir, { withFileTypes: true });
  for (const entry of redesignEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const page = rewriteRedesignPage(fs.readFileSync(path.join(redesignDir, entry.name), 'utf-8'));
    page.originalAssets.forEach((a) => neededAssets.add(a));
    demoPages[entry.name] = page.html;
  }

  for (const rel of neededAssets) {
    if (!fs.existsSync(path.join(originalDir, rel))) {
      throw new Error(`Showcase/redesign references a missing file: original/${rel}`);
    }
  }

  // 3. Integrity scan — a broken demo must never reach production
  const htmlByFile = { 'index.html': showcase.html };
  for (const [name, html] of Object.entries(demoPages)) htmlByFile[`demo/${name}`] = html;
  const offenders = scanIntegrity(htmlByFile);
  if (offenders.length) {
    const list = offenders.map((o) => `  ${o.file}: ${o.ref}`).join('\n');
    throw new Error(`Deploy aborted — unresolved relative references:\n${list}`);
  }

  // 4. Write the target layout (fresh — the slug dir is fully owned by deploys)
  const slug = projectId;
  // If the /webs section of your site also hosts your own pages (a landing,
  // an intake form…), a project slug with the same name would shadow them.
  // 'index' and 'assets' are always reserved; add your own page names via
  // deploy.reservedSlugs in config.operator.json.
  const reserved = ['index', 'assets', ...(config.deploy.reservedSlugs || [])];
  if (reserved.includes(slug)) {
    throw new Error(`"${slug}" is a reserved name in /webs (see deploy.reservedSlugs) — rename the project`);
  }
  const target = path.join(publicDir, 'webs', slug);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.join(target, 'demo'), { recursive: true });

  // Visit tracking goes into every published page (showcase + demo pages).
  // No tracking config → empty snippet → pages publish untouched.
  const snippet = trackingSnippet(config, slug);
  if (snippet) log('[deploy] tracking snippet injected (' + (config.tracking.provider) + ')');

  fs.writeFileSync(path.join(target, 'index.html'), injectTracking(showcase.html, snippet));
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
  log(`[deploy] wrote ${path.relative(repo, target)} (${Object.keys(demoPages).length} demo pages, ${neededAssets.size} shared assets)`);

  // 5. Commit + push, scoped to the slug dir
  const pipeline = loadJSON(pipelinePath, []);
  const entry = pipeline.find((p) => p.id === projectId);
  const nombre = entry ? entry.nombre : projectId;
  const result = commitAndPush(repo, {
    pathspec: path.posix.join('public', 'webs', slug),
    subject: `Deploy redesign demo: ${nombre} (${slug})`,
    coAuthor: config.coAuthor,
    branch,
    push,
    log,
  });

  // 6. Record the public URL in the pipeline
  // No trailing slash: Firebase (cleanUrls + trailingSlash:false) 301s "/x/" → "/x"
  const publicUrl = `${webBaseUrl}/webs/${slug}`;
  await updateJSON(pipelinePath, (entries) => {
    const item = (entries || []).find((p) => p.id === projectId);
    if (!item) {
      log(`[deploy] warning: no pipeline entry for "${projectId}" — publicUrl not recorded`);
      return entries || [];
    }
    item.publicUrl = publicUrl;
    item.showcaseUrl = publicUrl;
    item.ultimaAccion = new Date().toISOString().slice(0, 10);
  }, []);

  log(`[deploy] public URL: ${publicUrl}${result.pushed ? ' (live once CI finishes)' : ' (NOT pushed)'}`);
  return { publicUrl, ...result };
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

module.exports = { publish };
