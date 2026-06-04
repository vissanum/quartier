// Job runner: spawns whitelisted CLI scripts (host or Docker via ./run.sh),
// buffers their output for SSE streaming, and serializes work that must not
// overlap (Docker jobs, per-project mutations, deploys).

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const crypto = require('crypto');
const { httpError } = require('./router');

const MAX_LINES = 2000;

// Closed table — the API can only run these, with positional args, never a shell.
const JOB_TABLE = {
  search: {
    runner: 'docker', maxMs: 300000,
    argv: (a) => ['node', 'prospect/search.js', ...(a.type ? [a.type] : []), a.query, ...(a.dryRun ? ['--dry-run'] : [])],
  },
  details: {
    runner: 'docker', maxMs: 300000,
    argv: (a) => ['node', 'prospect/details.js', ...(a.id ? [a.id] : ['--pending']), ...(a.limit ? ['--limit', String(a.limit)] : [])],
  },
  fetch: {
    runner: 'docker', maxMs: 180000,
    argv: (a) => ['node', 'prospect/fetch.js', a.url, ...(a.screenshot ? ['--screenshot'] : [])],
  },
  analyze: {
    runner: 'docker', maxMs: 600000,
    argv: (a) => ['bash', 'prospect/analyze.sh', ...(a.id ? ['--id', a.id] : []), ...(a.limit ? ['--limit', String(a.limit)] : [])],
  },
  scrape: {
    runner: 'docker', maxMs: 600000, project: (a) => a.name,
    argv: (a) => ['node', 'scraper/scrape-site.js', a.url, a.name],
  },
  'google-places': {
    runner: 'docker', maxMs: 180000, project: (a) => a.name,
    argv: (a) => ['node', 'scraper/google-places.js', a.business, a.city, a.name],
  },
  'generate-site': {
    runner: 'host', maxMs: 120000, project: (a) => a.name,
    argv: (a) => ['node', 'generate/site.js', a.name],
  },
  'generate-report': {
    runner: 'host', maxMs: 120000, project: (a) => a.name,
    argv: (a) => ['node', 'generate/report.js', a.name],
  },
  'validate-html': {
    runner: 'docker', maxMs: 300000,
    argv: (a) => ['bash', 'tools/validate-html.sh', `projects/${a.name}/redesign`],
  },
  'optimize-images': {
    runner: 'docker', maxMs: 300000, project: (a) => a.name,
    argv: (a) => ['bash', 'tools/optimize-images.sh', `projects/${a.name}/redesign/assets`, ...(a.webp ? ['--webp'] : [])],
  },
  'enrich-emails': {
    runner: 'host', maxMs: 300000,
    argv: (a) => ['node', 'prospect/enrich-emails.js', ...(a.id ? ['--id', a.id] : ['--pending']), ...(a.limit ? ['--limit', String(a.limit)] : [])],
  },
  deploy: {
    runner: 'host', maxMs: 180000, project: (a) => a.id, lock: 'deploy',
    argv: (a) => ['node', 'deploy/publish.js', a.id, ...(a.noPush ? ['--no-push'] : [])],
  },
};

const jobs = new Map(); // id → job
let dockerBusy = false;
const dockerQueue = [];
const projectLocks = new Set();
let deployBusy = false;

function publicJob(job) {
  return {
    id: job.id, name: job.name, args: job.args, status: job.status,
    exitCode: job.exitCode, startedAt: job.startedAt, endedAt: job.endedAt,
    lineCount: job.lines.length,
  };
}

function pushLine(job, stream, line) {
  const item = { stream, line, t: Date.now() };
  job.lines.push(item);
  if (job.lines.length > MAX_LINES) job.lines.shift();
  job.emitter.emit('line', item);
}

function start(name, args = {}) {
  const spec = JOB_TABLE[name];
  if (!spec) throw httpError(400, `Unknown job "${name}" (available: ${Object.keys(JOB_TABLE).join(', ')})`);

  const project = spec.project ? spec.project(args) : null;
  if (project && projectLocks.has(project)) {
    throw httpError(409, `Project "${project}" already has a job running — wait for it to finish`);
  }
  if (spec.lock === 'deploy' && deployBusy) {
    throw httpError(409, 'A deploy is already running — only one at a time');
  }

  const job = {
    id: crypto.randomUUID().slice(0, 8),
    name, args, spec, project,
    status: 'queued',
    exitCode: null,
    startedAt: null,
    endedAt: null,
    lines: [],
    emitter: new EventEmitter(),
    child: null,
  };
  job.emitter.setMaxListeners(50);
  jobs.set(job.id, job);

  if (project) projectLocks.add(project);
  if (spec.lock === 'deploy') deployBusy = true;

  if (spec.runner === 'docker' && dockerBusy) {
    dockerQueue.push(job);
    pushLine(job, 'system', '[job-runner] queued — waiting for the running Docker job to finish');
  } else {
    spawnJob(job);
  }
  return publicJob(job);
}

function spawnJob(job) {
  const { spec } = job;
  if (spec.runner === 'docker') dockerBusy = true;
  job.status = 'running';
  job.startedAt = new Date().toISOString();

  const argv = spec.argv(job.args);
  const [cmd, ...cmdArgs] = spec.runner === 'docker' ? ['./run.sh', ...argv] : argv;
  const env = { ...process.env };
  // Headless Docker jobs must not bind the legacy UI ports (see run.sh)
  if (spec.runner === 'docker') env.QUARTIER_NO_PORTS = '1';

  let child;
  try {
    child = spawn(cmd, cmdArgs, { cwd: process.cwd(), env, shell: false });
  } catch (err) {
    pushLine(job, 'system', `[job-runner] failed to start: ${err.message}`);
    finish(job, -1);
    return;
  }
  job.child = child;

  const timer = setTimeout(() => {
    pushLine(job, 'system', `[job-runner] timed out after ${spec.maxMs / 1000}s — sending SIGTERM`);
    child.kill('SIGTERM');
    setTimeout(() => { if (job.status === 'running') child.kill('SIGKILL'); }, 5000);
  }, spec.maxMs);

  const buffers = { stdout: '', stderr: '' };
  const onData = (stream) => (chunk) => {
    buffers[stream] += chunk.toString('utf-8');
    let nl;
    while ((nl = buffers[stream].indexOf('\n')) !== -1) {
      const line = buffers[stream].slice(0, nl).trimEnd();
      buffers[stream] = buffers[stream].slice(nl + 1);
      if (line) pushLine(job, stream, line);
    }
  };
  child.stdout.on('data', onData('stdout'));
  child.stderr.on('data', onData('stderr'));

  child.on('error', (err) => {
    clearTimeout(timer);
    pushLine(job, 'system', `[job-runner] failed to start: ${err.message}`);
    finish(job, -1);
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    for (const stream of ['stdout', 'stderr']) {
      if (buffers[stream].trim()) pushLine(job, stream, buffers[stream].trimEnd());
    }
    finish(job, code === null ? -1 : code);
  });
}

function finish(job, exitCode) {
  if (job.status === 'done' || job.status === 'error') return;
  job.exitCode = exitCode;
  job.status = exitCode === 0 ? 'done' : 'error';
  job.endedAt = new Date().toISOString();

  if (job.project) projectLocks.delete(job.project);
  if (job.spec.lock === 'deploy') deployBusy = false;
  if (job.spec.runner === 'docker') {
    dockerBusy = false;
    const next = dockerQueue.shift();
    if (next) spawnJob(next);
  }
  job.emitter.emit('end', { exitCode });
}

function get(id) {
  return jobs.get(id) || null;
}

function list() {
  return [...jobs.values()].map(publicJob).sort((a, b) => (b.startedAt || '') < (a.startedAt || '') ? -1 : 1);
}

function kill(id) {
  const job = jobs.get(id);
  if (!job) throw httpError(404, `No job "${id}"`);
  if (job.status === 'queued') {
    const i = dockerQueue.indexOf(job);
    if (i !== -1) dockerQueue.splice(i, 1);
    pushLine(job, 'system', '[job-runner] cancelled while queued');
    finish(job, -1);
  } else if (job.status === 'running' && job.child) {
    job.child.kill('SIGTERM');
  }
  return publicJob(job);
}

module.exports = { start, get, list, kill, publicJob, JOB_TABLE };
