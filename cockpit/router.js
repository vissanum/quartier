// Minimal HTTP router: ordered (method, pattern) table with named :params,
// JSON body parsing and uniform JSON responses. No dependencies.

const MAX_BODY = 1024 * 1024; // 1 MB

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const names = [];
    const regex = new RegExp(
      '^' + pattern.replace(/:[a-zA-Z]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$'
    );
    routes.push({ method, regex, names, handler });
  }

  // Returns true if a route matched (response handled), false otherwise
  async function dispatch(req, res) {
    const url = new URL(req.url, 'http://localhost');
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.regex);
      if (!m) continue;

      const params = {};
      r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      try {
        const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readJson(req) : null;
        const result = await r.handler({ req, res, params, query: url.searchParams, body });
        // Streaming handlers (SSE) write their own headers — leave them alone
        if (!res.headersSent) {
          if (result === undefined) json(res, 204, {});
          else json(res, 200, result);
        }
      } catch (err) {
        if (!res.headersSent) json(res, err.statusCode || 500, { error: err.message, code: err.code || undefined });
        else if (!res.writableEnded) res.end();
      }
      return true;
    }
    return false;
  }

  return { add, dispatch };
}

function httpError(statusCode, message, extra = {}) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

module.exports = { createRouter, json, httpError };
