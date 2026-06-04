#!/usr/bin/env node
// Static preview server with live reload. Serves any directory and reloads
// the browser on every file change — for reviewing landings, redesigns and
// showcases while they're being edited.
//
// Usage: node tools/preview.js <dir> [port]
// Example: node tools/preview.js ../your-website-repo/public 4321

const fs = require('fs');
const http = require('http');
const path = require('path');

const [, , dirArg, portArg] = process.argv;
if (!dirArg) {
  console.error('Usage: node tools/preview.js <dir> [port]');
  process.exit(1);
}
const ROOT = path.resolve(dirArg);
const PORT = parseInt(portArg || '4321', 10);
if (!fs.existsSync(ROOT)) {
  console.error(`No such directory: ${ROOT}`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.xml': 'application/xml',
  '.txt': 'text/plain', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const RELOAD_SNIPPET = `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;

// SSE subscribers + debounced fs.watch broadcast
const subscribers = new Set();
let timer = null;
fs.watch(ROOT, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const res of subscribers) res.write('data: reload\n\n');
  }, 150);
});

function resolveFile(pathname) {
  const rel = pathname.replace(/^\/+/, '');
  const base = path.resolve(ROOT, rel || '.');
  if (base !== ROOT && !base.startsWith(ROOT + path.sep)) return null; // traversal guard
  // exact file → dir/index.html → file.html (cleanUrls)
  for (const candidate of [base, path.join(base, 'index.html'), `${base}.html`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  if (pathname === '/__reload') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(':\n\n');
    subscribers.add(res);
    req.on('close', () => subscribers.delete(res));
    return;
  }

  const file = resolveFile(pathname);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`404 — ${pathname}`);
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  if (ext === '.html') {
    const html = fs.readFileSync(file, 'utf-8');
    res.end(html.includes('</body>') ? html.replace('</body>', `${RELOAD_SNIPPET}</body>`) : html + RELOAD_SNIPPET);
  } else {
    fs.createReadStream(file).pipe(res);
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Preview → http://127.0.0.1:${PORT} (serving ${ROOT}, live reload on)`);
});
