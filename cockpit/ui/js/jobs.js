// Workbench console: streams one job at a time over SSE into the bottom
// drawer. `runJob(name, args, opts)` starts and follows it.

const consoleEl = {
  root: () => document.getElementById('console'),
  pilot: () => document.getElementById('console-pilot'),
  title: () => document.getElementById('console-title'),
  body: () => document.getElementById('console-body'),
  kill: () => document.getElementById('console-kill'),
};

let currentJobId = null;
let currentSource = null;

function consoleOpen(title) {
  consoleEl.title().textContent = title;
  consoleEl.body().textContent = '';
  consoleEl.pilot().className = 'pilot running';
  consoleEl.kill().hidden = false;
  consoleEl.root().classList.add('open');
}

function consoleLine(item) {
  const div = document.createElement('div');
  if (item.stream === 'stderr') div.className = 'err';
  if (item.stream === 'system') div.className = 'sys';
  div.textContent = item.line;
  const body = consoleEl.body();
  const stick = body.scrollTop + body.clientHeight >= body.scrollHeight - 24;
  body.appendChild(div);
  if (stick) body.scrollTop = body.scrollHeight;
}

function consoleEnd(status) {
  consoleEl.pilot().className = `pilot ${status === 'done' ? 'done' : 'error'}`;
  consoleEl.kill().hidden = true;
  currentJobId = null;
  if (currentSource) { currentSource.close(); currentSource = null; }
}

// Follow an already-created job (returned by POST /api/jobs or /api/deploy)
function followJob(job, title, onEnd) {
  consoleOpen(title || `${job.name} #${job.id}`);
  currentJobId = job.id;
  currentSource = new EventSource(`/api/jobs/${job.id}/stream`);
  currentSource.onmessage = (e) => consoleLine(JSON.parse(e.data));
  currentSource.addEventListener('end', (e) => {
    const { status, exitCode } = JSON.parse(e.data);
    consoleLine({ stream: 'system', line: `— ${status} (exit ${exitCode}) —` });
    consoleEnd(status);
    if (onEnd) onEnd(status, exitCode);
  });
  currentSource.onerror = () => { /* job process keeps running server-side */ };
}

async function runJob(name, args, { title, onEnd } = {}) {
  try {
    const job = await api.post('/api/jobs', { job: name, args: args || {} });
    followJob(job, title, onEnd);
    return job;
  } catch (err) {
    toast(err.message, 'err');
    return null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('console-close').addEventListener('click', () => {
    consoleEl.root().classList.remove('open');
  });
  consoleEl.kill().addEventListener('click', async () => {
    if (currentJobId) {
      try { await api.post(`/api/jobs/${currentJobId}/kill`); } catch (err) { toast(err.message, 'err'); }
    }
  });
});
