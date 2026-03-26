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
const operatorDefaults = { name: 'Your Name', email: 'your@email.com', website: 'https://yourwebsite.com', showcaseBaseUrl: '' };
const operator = fs.existsSync(operatorPath) ? JSON.parse(fs.readFileSync(operatorPath, 'utf-8')) : operatorDefaults;

module.exports = {
  ...operatorDefaults,
  ...operator,
  placesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
};
