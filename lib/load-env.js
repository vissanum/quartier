const fs = require('fs');
const path = require('path');

// Load .env (API keys)
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

// Load operator config
const operatorPath = path.join(process.cwd(), 'config.operator.json');
const operatorDefaults = {
  name: 'Your Name',
  email: 'your@email.com',
  website: 'https://yourwebsite.com',
  showcaseBaseUrl: '',
  // Where demos get published. mode "git": a sibling git repo whose CI deploys
  // static files. mode "firebase": a dedicated Firebase Hosting site released
  // directly from a local workspace (seconds, no git round-trip).
  // Public URL of the operator's service page (defaults to <webBaseUrl>/webs)
  serviceUrl: '',
  deploy: {
    mode: 'git',
    repoPath: '', branch: 'main', webBaseUrl: '',
    // demosPath: subdir for demos inside the site ("" = site root).
    // serviceDir: folder in the deploy repo synced (from HEAD) to the site
    // root — turns the site into the unified service+demos host.
    firebase: { project: '', site: '', baseUrl: '', workspace: '', demosPath: '', serviceDir: '' },
  },
  // Outreach sender identity (Resend); API key lives in .env
  resend: { from: '', replyTo: '' },
  coAuthor: 'Claude <noreply@anthropic.com>',
};
const operator = fs.existsSync(operatorPath) ? JSON.parse(fs.readFileSync(operatorPath, 'utf-8')) : {};

module.exports = {
  ...operatorDefaults,
  ...operator,
  deploy: {
    ...operatorDefaults.deploy,
    ...(operator.deploy || {}),
    firebase: { ...operatorDefaults.deploy.firebase, ...((operator.deploy || {}).firebase || {}) },
  },
  resend: { ...operatorDefaults.resend, ...(operator.resend || {}) },
  placesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
};
