// Project detail: config, file presence and readiness flags the UI uses to
// enable/disable action buttons.

const fs = require('fs');
const path = require('path');
const { loadJSON } = require('../../lib/json-store');
const { httpError } = require('../router');

function projectsRoot() {
  return path.join(process.cwd(), 'projects');
}

function list() {
  const root = projectsRoot();
  if (!fs.existsSync(root)) return { projects: [] };
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const pipeline = loadJSON(path.join(root, 'pipeline.json'), []);
  return {
    projects: dirs.map((id) => ({
      id,
      inPipeline: pipeline.some((p) => p.id === id),
      hasShowcase: fs.existsSync(path.join(root, id, 'showcase.html')),
      hasRedesign: fs.existsSync(path.join(root, id, 'redesign', 'index.html')),
    })),
  };
}

function countFiles(dir, ext) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
}

function detail({ params }) {
  const root = projectsRoot();
  const dir = path.join(root, params.id);
  if (!fs.existsSync(dir)) throw httpError(404, `No project "${params.id}"`);

  const config = loadJSON(path.join(dir, 'config.json'), null);
  const pipeline = loadJSON(path.join(root, 'pipeline.json'), []);
  const entry = pipeline.find((p) => p.id === params.id) || null;
  const prospects = loadJSON(path.join(process.cwd(), 'prospects', 'prospects.json'), []);
  const prospect = prospects.find((p) => p.pipelineId === params.id) || null;

  const files = {
    config: !!config,
    sitemap: fs.existsSync(path.join(dir, 'original', 'sitemap.json')),
    showcase: fs.existsSync(path.join(dir, 'showcase.html')),
    redesignIndex: fs.existsSync(path.join(dir, 'redesign', 'index.html')),
    screenshotDesktop: fs.existsSync(path.join(dir, 'original', 'screenshot-desktop.png')),
    screenshotMobile: fs.existsSync(path.join(dir, 'original', 'screenshot-mobile.png')),
    googlePlaces: fs.existsSync(path.join(dir, 'original', 'google-places.json')),
    redesignPages: countFiles(path.join(dir, 'redesign'), '.html'),
    originalPages: countFiles(path.join(dir, 'original', 'pages'), '.html'),
  };

  const email = (config && config.email) || (prospect && prospect.email) || null;
  return {
    id: params.id,
    config,
    pipeline: entry,
    prospect: prospect ? { id: prospect.id, name: prospect.name, email: prospect.email || null } : null,
    files,
    readiness: {
      canGenerate: files.sitemap && files.config,
      canDeploy: files.showcase && files.redesignIndex,
      canOutreach: !!(entry && entry.publicUrl && email),
      email,
    },
  };
}

module.exports = { list, detail };
