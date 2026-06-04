// Job control: start whitelisted scripts, list them, stream output via SSE.

const runner = require('../job-runner');
const { httpError } = require('../router');

function startJob({ body }) {
  if (!body || !body.job) throw httpError(400, 'Missing "job" in body');
  return runner.start(body.job, body.args || {});
}

function listJobs() {
  return { jobs: runner.list() };
}

function killJob({ params }) {
  return runner.kill(params.id);
}

// SSE: replay buffered lines, then stream live until the job ends.
function stream({ req, res, params }) {
  const job = runner.get(params.id);
  if (!job) throw httpError(404, `No job "${params.id}"`);

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write(`event: meta\ndata: ${JSON.stringify(runner.publicJob(job))}\n\n`);
  for (const item of job.lines) {
    res.write(`data: ${JSON.stringify(item)}\n\n`);
  }
  if (job.status === 'done' || job.status === 'error') {
    res.write(`event: end\ndata: ${JSON.stringify({ exitCode: job.exitCode, status: job.status })}\n\n`);
    res.end();
    return null; // response already handled
  }

  const onLine = (item) => res.write(`data: ${JSON.stringify(item)}\n\n`);
  const onEnd = ({ exitCode }) => {
    res.write(`event: end\ndata: ${JSON.stringify({ exitCode, status: exitCode === 0 ? 'done' : 'error' })}\n\n`);
    res.end();
    cleanup();
  };
  function cleanup() {
    job.emitter.removeListener('line', onLine);
    job.emitter.removeListener('end', onEnd);
  }
  job.emitter.on('line', onLine);
  job.emitter.once('end', onEnd);
  req.on('close', cleanup);
  return null;
}

module.exports = { startJob, listJobs, killJob, stream };
