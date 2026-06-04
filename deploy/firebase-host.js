// Direct-to-Firebase-Hosting delivery for demos (deploy.mode "firebase").
//
// A persistent local workspace holds the COMPLETE content of the demos site
// (every published slug + root pages); each `firebase deploy` releases the
// whole workspace as the new site version. Firebase dedupes uploads by file
// hash, so re-deploying N demos where one changed uploads only the change —
// a publish lands in seconds, no git round-trip, no CI wait.
//
// Workspace layout (gitignored — it contains client demos):
//   <workspace>/firebase.json   ← generated every deploy (source of truth: code+config)
//   <workspace>/public/
//     index.html                ← hands off to the service landing (site-pages.js)
//     404.html                  ← crafted dead end for stale demo links
//     <slug>/{index.html,demo/,assets/}

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { rootIndexHtml, notFoundHtml } = require('./site-pages');

// Root-level names a project slug may never take on the demos site.
const RESERVED = ['index', '404', 'assets'];

function firebaseConfig(config) {
  const fb = (config.deploy && config.deploy.firebase) || {};
  const missing = ['project', 'site'].filter((k) => !fb[k]);
  if (missing.length) {
    throw new Error(
      `config.operator.json deploy.firebase is missing: ${missing.join(', ')}.\n` +
      '  Expected: "deploy": { "mode": "firebase", "firebase": { "project": "<gcp-project>", "site": "<hosting-site-id>", "baseUrl": "https://demos.example.com" } }\n' +
      `  Create the site once with: firebase hosting:sites:create <site-id> --project <gcp-project>`
    );
  }
  return fb;
}

function workspaceDir(config) {
  const fb = firebaseConfig(config);
  return path.resolve(process.cwd(), fb.workspace || path.join('deploy', 'site'));
}

function publicDir(config) {
  return path.join(workspaceDir(config), 'public');
}

// The public URL a published demo gets. Until the custom domain resolves,
// the site is equally live at https://<site>.web.app — baseUrl simply
// switches the canonical address recorded in the pipeline.
function siteBaseUrl(config) {
  const fb = firebaseConfig(config);
  return (fb.baseUrl || `https://${fb.site}.web.app`).replace(/\/+$/, '');
}

// Idempotent: creates the workspace skeleton, refreshes the generated
// firebase.json, and writes root pages only when absent (an operator who
// customized them keeps their version).
function ensureWorkspace(config, { log = console.log } = {}) {
  const ws = workspaceDir(config);
  const pub = publicDir(config);
  fs.mkdirSync(pub, { recursive: true });

  const fb = firebaseConfig(config);
  // Mirrors the main site's hosting behavior (cleanUrls, no trailing slash)
  // and adds an X-Robots-Tag belt to the per-page noindex suspenders.
  const hostingJson = {
    hosting: {
      site: fb.site,
      public: 'public',
      ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      cleanUrls: true,
      trailingSlash: false,
      headers: [
        { source: '**', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      ],
    },
  };
  fs.writeFileSync(path.join(ws, 'firebase.json'), JSON.stringify(hostingJson, null, 2) + '\n');

  const rootIndex = path.join(pub, 'index.html');
  if (!fs.existsSync(rootIndex)) {
    fs.writeFileSync(rootIndex, rootIndexHtml(config));
    log('[firebase] wrote site root index.html (hands off to the service landing)');
  }
  const notFound = path.join(pub, '404.html');
  if (!fs.existsSync(notFound)) {
    fs.writeFileSync(notFound, notFoundHtml(config));
    log('[firebase] wrote site 404.html');
  }
  return { workspace: ws, publicDir: pub };
}

// Slug directory inside the workspace, with the same reserved-name guard
// semantics the git host applies to /webs.
function slugTarget(config, slug) {
  if (RESERVED.includes(slug)) {
    throw new Error(`"${slug}" is a reserved name on the demos site — rename the project`);
  }
  return path.join(publicDir(config), slug);
}

// Releases the whole workspace as a new site version. Captured output keeps
// cockpit job logs readable; on failure we translate the usual firebase-tools
// complaints into actionable next steps.
function deploySite(config, { log = console.log } = {}) {
  const fb = firebaseConfig(config);
  const ws = workspaceDir(config);
  log(`[firebase] deploying to site "${fb.site}" (project ${fb.project})…`);
  let out;
  try {
    out = execFileSync('firebase', ['deploy', '--only', 'hosting', '--project', fb.project], {
      cwd: ws,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 150000,
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('firebase-tools is not installed. Run: npm install -g firebase-tools && firebase login');
    }
    const detail = `${err.stdout || ''}\n${err.stderr || ''}`;
    if (/not (currently )?(logged in|authenticated)|authentication|credential/i.test(detail)) {
      throw new Error('firebase CLI is not authenticated. Run: firebase login');
    }
    if (/site .* (not found|does ?n.t exist)|no site/i.test(detail)) {
      throw new Error(
        `Hosting site "${fb.site}" not found in project "${fb.project}". ` +
        `Create it once with: firebase hosting:sites:create ${fb.site} --project ${fb.project}`
      );
    }
    const tail = detail.trim().split('\n').slice(-6).join('\n');
    throw new Error(`firebase deploy failed:\n${tail}`);
  }
  const released = (out.match(/Deploy complete!/i) || [])[0];
  log(`[firebase] ${released ? 'deploy complete' : 'deploy finished'} → ${siteBaseUrl(config)}`);
  return { deployed: true, url: siteBaseUrl(config) };
}

module.exports = { ensureWorkspace, slugTarget, deploySite, siteBaseUrl, workspaceDir, publicDir, RESERVED };
