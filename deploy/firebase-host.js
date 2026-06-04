// Direct-to-Firebase-Hosting delivery (deploy.mode "firebase").
//
// A persistent local workspace holds the COMPLETE content of the hosting
// site; each `firebase deploy` releases the whole workspace as the new site
// version. Firebase dedupes uploads by file hash, so re-deploying N demos
// where one changed uploads only the change — a publish lands in seconds,
// no git round-trip, no CI wait.
//
// Two layouts, chosen by deploy.firebase config:
//
// Demos-only site (defaults):
//   <workspace>/public/<slug>/…           demosPath "" — demos at the root
//   root index.html hands off to the operator's service page; crafted 404.
//
// Unified service + demos site (serviceDir + demosPath set):
//   <workspace>/public/…                  ← service pages, synced from the
//                                           deploy repo's LAST COMMIT
//   <workspace>/public/<demosPath>/<slug>/…
//   The service is the site root, so no hand-off page is generated; the 404
//   is still ours. Syncing from HEAD (never the working tree) guarantees a
//   demo publish can never drag half-edited service pages to production.
//
// The workspace is gitignored — it contains client demos.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { rootIndexHtml, notFoundHtml } = require('./site-pages');

// Names a project slug may never take inside the demos directory.
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

// Where demo slug dirs live inside the site ("" = site root).
function demosPath(config) {
  return (firebaseConfig(config).demosPath || '').replace(/^\/+|\/+$/g, '');
}

// The public URL a published demo gets. Until the custom domain resolves,
// the site is equally live at https://<site>.web.app — baseUrl simply
// switches the canonical address recorded in the pipeline.
function siteBaseUrl(config) {
  const fb = firebaseConfig(config);
  return (fb.baseUrl || `https://${fb.site}.web.app`).replace(/\/+$/, '');
}

function demoUrl(config, slug) {
  const sub = demosPath(config);
  return `${siteBaseUrl(config)}${sub ? `/${sub}` : ''}/${slug}`;
}

// Sync the operator's service pages (landing, intake, legal…) from the
// deploy repo's last commit into the workspace root. HEAD only — a dirty
// working tree must never leak into a demo publish. Stale service files
// are swept first so deletions in the repo propagate to the site.
function syncService(config, { log = console.log } = {}) {
  const fb = firebaseConfig(config);
  if (!fb.serviceDir) return false;
  const repoPath = config.deploy.repoPath;
  if (!repoPath) throw new Error('deploy.firebase.serviceDir is set but deploy.repoPath is missing');
  const repo = path.resolve(process.cwd(), repoPath);
  const pub = publicDir(config);
  const keep = new Set([demosPath(config) || null, '404.html'].filter(Boolean));

  for (const entry of fs.existsSync(pub) ? fs.readdirSync(pub) : []) {
    if (!keep.has(entry)) fs.rmSync(path.join(pub, entry), { recursive: true, force: true });
  }
  try {
    const tar = execFileSync('git', ['-C', repo, 'archive', 'HEAD', fb.serviceDir], { maxBuffer: 256 * 1024 * 1024 });
    execFileSync('tar', ['-x', `--strip-components=${fb.serviceDir.split('/').length}`, '-C', pub], { input: tar });
  } catch (err) {
    throw new Error(
      `Could not sync service pages from ${repo} (HEAD:${fb.serviceDir}): ${err.message}\n` +
      '  Is deploy.firebase.serviceDir committed in the deploy repo?'
    );
  }
  log(`[firebase] service pages synced from ${path.basename(repo)} HEAD:${fb.serviceDir}`);
  return true;
}

// Idempotent: creates the workspace skeleton, refreshes the generated
// firebase.json, syncs service pages (unified layout), and writes chrome
// pages only when absent or operator-owned rules apply.
function ensureWorkspace(config, { log = console.log } = {}) {
  const ws = workspaceDir(config);
  const pub = publicDir(config);
  fs.mkdirSync(pub, { recursive: true });

  const fb = firebaseConfig(config);
  // Mirrors the main site's hosting behavior (cleanUrls, no trailing slash).
  // Demos get an X-Robots-Tag belt on top of their per-page noindex meta;
  // service pages (unified layout) stay indexable.
  const sub = demosPath(config);
  const noindexSource = sub ? `/${sub}/**` : '**';
  const hostingJson = {
    hosting: {
      site: fb.site,
      public: 'public',
      ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      cleanUrls: true,
      trailingSlash: false,
      headers: [
        { source: noindexSource, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      ],
    },
  };
  fs.writeFileSync(path.join(ws, 'firebase.json'), JSON.stringify(hostingJson, null, 2) + '\n');

  const hasService = syncService(config, { log });

  if (!hasService) {
    // Demos-only layout: the root hands off to the service landing.
    const rootIndex = path.join(pub, 'index.html');
    if (!fs.existsSync(rootIndex)) {
      fs.writeFileSync(rootIndex, rootIndexHtml(config));
      log('[firebase] wrote site root index.html (hands off to the service landing)');
    }
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
  const sub = demosPath(config);
  return path.join(publicDir(config), ...(sub ? [sub] : []), slug);
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

module.exports = { ensureWorkspace, slugTarget, deploySite, siteBaseUrl, demoUrl, workspaceDir, publicDir, RESERVED };
