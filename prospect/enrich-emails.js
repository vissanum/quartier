#!/usr/bin/env node
// Fill prospects' email field by scanning their websites (homepage plus the
// usual contact/legal pages). Plain HTTP + regex — no browser, runs on host.
//
// Usage:
//   node prospect/enrich-emails.js --id <prospect-id>
//   node prospect/enrich-emails.js --pending [--limit N]

const path = require('path');
const { loadJSON, updateJSON } = require('../lib/json-store');
const { extractEmails } = require('../lib/emails');

const PROSPECTS_PATH = path.join(process.cwd(), 'prospects', 'prospects.json');
// Tried in order; stops at the first page that yields an address
const CONTACT_PATHS = ['', '/contacto', '/contact', '/contacta', '/contactanos', '/aviso-legal', '/contact-us'];

async function fetchHtml(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Quartier; +https://github.com/EnriqueLop/quartier)' },
    });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') || '').includes('html')) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function findEmails(website) {
  const base = website.replace(/\/+$/, '');
  for (const p of CONTACT_PATHS) {
    const html = await fetchHtml(base + p);
    if (!html) continue;
    const emails = extractEmails(html, website);
    if (emails.length) return { emails, source: p || '/' };
  }
  return { emails: [], source: null };
}

async function main() {
  const args = process.argv.slice(2);
  const idFlag = args.indexOf('--id') !== -1 ? args[args.indexOf('--id') + 1] : null;
  const limitFlag = args.indexOf('--limit') !== -1 ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;

  if (!idFlag && !args.includes('--pending')) {
    console.error('Usage: node prospect/enrich-emails.js --id <prospect-id> | --pending [--limit N]');
    process.exit(1);
  }

  const prospects = loadJSON(PROSPECTS_PATH, []);
  const targets = idFlag
    ? prospects.filter((p) => p.id === idFlag || p.placeId === idFlag)
    : prospects.filter((p) => p.website && !p.email && p.status !== 'rejected').slice(0, limitFlag);

  if (!targets.length) {
    console.log(idFlag ? `No prospect found with id "${idFlag}"` : 'No pending prospects with website and no email');
    return;
  }

  console.log(`Scanning ${targets.length} prospect(s) for contact emails…\n`);
  let found = 0;
  for (const p of targets) {
    if (!p.website) {
      console.log(`· ${p.name} — no website, skipped`);
      continue;
    }
    const { emails, source } = await findEmails(p.website);
    if (emails.length) {
      found++;
      console.log(`✓ ${p.name} — ${emails[0]} (${source})${emails.length > 1 ? ` +${emails.length - 1} more` : ''}`);
      await updateJSON(PROSPECTS_PATH, (all) => {
        const item = all.find((x) => x.id === p.id);
        if (item) {
          item.email = emails[0];
          item.emailsAll = emails;
        }
      }, []);
    } else {
      console.log(`✗ ${p.name} — no email found`);
    }
  }
  console.log(`\nDone: ${found}/${targets.length} prospects enriched`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
