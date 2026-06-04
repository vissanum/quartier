#!/usr/bin/env node
// Quartier Cockpit — unified local control panel.
//
// Single server (default http://127.0.0.1:3458) that serves the UI, a REST
// API over the pipeline/prospects/projects JSON files, a job runner that
// streams script output via SSE, the deploy trigger and the outreach
// composer. Localhost-only by design: this holds prospect personal data and
// can send email — it must never be exposed.
//
// Usage: node cockpit/server.js   (from anywhere — it cds to the repo root)

const path = require('path');

// Everything (lib/load-env, data paths, ./run.sh spawns) assumes the repo root
process.chdir(path.join(__dirname, '..'));

const http = require('http');
const { createRouter, json } = require('./router');
const { serveStatic } = require('./static');
const config = require('../lib/load-env');

const pipeline = require('./routes/pipeline');
const prospects = require('./routes/prospects');
const projects = require('./routes/projects');
const jobs = require('./routes/jobs');
const outreach = require('./routes/outreach');
const runner = require('./job-runner');

const PORT = parseInt(process.env.QUARTIER_COCKPIT_PORT || '3458', 10);
const HOST = '127.0.0.1';

const router = createRouter();

// Pipeline
router.add('GET', '/api/pipeline', () => pipeline.list());
router.add('POST', '/api/pipeline', (ctx) => pipeline.create(ctx));
router.add('PATCH', '/api/pipeline/:id', (ctx) => pipeline.patch(ctx));
router.add('DELETE', '/api/pipeline/:id', (ctx) => pipeline.remove(ctx));

// Prospects
router.add('GET', '/api/prospects', () => prospects.list());
router.add('PATCH', '/api/prospects/:id', (ctx) => prospects.patch(ctx));

// Projects
router.add('GET', '/api/projects', () => projects.list());
router.add('GET', '/api/projects/:id', (ctx) => projects.detail(ctx));

// Jobs
router.add('POST', '/api/jobs', (ctx) => jobs.startJob(ctx));
router.add('GET', '/api/jobs', () => jobs.listJobs());
router.add('GET', '/api/jobs/:id/stream', (ctx) => jobs.stream(ctx));
router.add('POST', '/api/jobs/:id/kill', (ctx) => jobs.killJob(ctx));

// Deploy runs as a job so its output streams to the UI console
router.add('POST', '/api/deploy/:id', (ctx) => runner.start('deploy', { id: ctx.params.id, noPush: !!(ctx.body && ctx.body.noPush) }));

// Outreach
router.add('POST', '/api/outreach/preview', (ctx) => outreach.preview(ctx));
router.add('POST', '/api/outreach/send', (ctx) => outreach.send(ctx));
router.add('GET', '/api/outreach/followups', (ctx) => outreach.followups(ctx));
router.add('GET', '/api/outreach/queue', () => outreach.queue());
router.add('GET', '/api/outreach/suppression', () => outreach.suppressionList());
router.add('POST', '/api/outreach/suppression', (ctx) => outreach.suppressionAdd(ctx));
router.add('DELETE', '/api/outreach/suppression', (ctx) => outreach.suppressionRemove(ctx));

// Non-secret config for the UI (never API keys)
router.add('GET', '/api/config', () => ({
  name: config.name,
  website: config.website,
  webBaseUrl: config.deploy.webBaseUrl,
  deployBranch: config.deploy.branch,
  resendFrom: config.resend.from,
  resendReplyTo: config.resend.replyTo,
  resendConfigured: !!config.resendApiKey,
  trackingProvider: (config.tracking && config.tracking.provider) || null,
  fases: pipeline.FASES,
}));

const ui = serveStatic(path.join(__dirname, 'ui'));
const projectFiles = serveStatic(path.join(process.cwd(), 'projects'));

const server = http.createServer(async (req, res) => {
  try {
    if (await router.dispatch(req, res)) return;
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Read-only previews of project files (showcase, redesign, screenshots)
    if (pathname.startsWith('/projects/')) {
      if (projectFiles(req, res, pathname.slice('/projects/'.length))) return;
    } else if (ui(req, res, pathname)) {
      return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    if (!res.writableEnded) json(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Quartier Cockpit → http://${HOST}:${PORT}`);
  console.log(`Operator: ${config.name} · deploy: ${config.deploy.webBaseUrl || '(not configured)'} · resend: ${config.resendApiKey ? 'configured' : 'NO API KEY'}`);
});
