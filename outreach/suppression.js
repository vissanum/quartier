#!/usr/bin/env node
// Suppression list for outreach: emails that replied "BAJA" (or must never be
// contacted again). send.js checks this BEFORE every send — first contact and
// follow-ups alike. The LSSI opt-out footer in the templates promises "no
// volveremos a escribirte"; this file is what makes that promise real.
//
// Storage: outreach/suppression.json — [{ email, date, reason }]
//
// CLI:
//   node outreach/suppression.js add <email> [reason]
//   node outreach/suppression.js remove <email>
//   node outreach/suppression.js list

const path = require('path');
const { loadJSON, updateJSON } = require('../lib/json-store');

// Overridable for tests only — the real legal record must never be touched
// by a test run.
const FILE = process.env.QUARTIER_SUPPRESSION_FILE
  || path.join(__dirname, 'suppression.json');

function normalize(email) {
  return String(email || '').trim().toLowerCase();
}

function loadSuppressionList() {
  return loadJSON(FILE, []);
}

function isSuppressed(email) {
  const target = normalize(email);
  if (!target) return false;
  return loadSuppressionList().some((s) => normalize(s.email) === target);
}

async function addSuppression(email, reason = 'BAJA') {
  const target = normalize(email);
  if (!target) throw new Error('addSuppression: empty email');
  return updateJSON(FILE, (list) => {
    const current = list || [];
    if (current.some((s) => normalize(s.email) === target)) return current;
    current.push({ email: target, date: new Date().toISOString(), reason });
    return current;
  }, []);
}

async function removeSuppression(email) {
  const target = normalize(email);
  return updateJSON(FILE, (list) => (list || []).filter((s) => normalize(s.email) !== target), []);
}

module.exports = { isSuppressed, addSuppression, removeSuppression, loadSuppressionList };

if (require.main === module) {
  const [cmd, email, ...reasonParts] = process.argv.slice(2);
  (async () => {
    if (cmd === 'add' && email) {
      await addSuppression(email, reasonParts.join(' ') || 'BAJA');
      console.log(`✓ Suppressed: ${normalize(email)}`);
    } else if (cmd === 'remove' && email) {
      await removeSuppression(email);
      console.log(`✓ Removed from suppression list: ${normalize(email)}`);
    } else if (cmd === 'list') {
      const list = loadSuppressionList();
      if (!list.length) console.log('(suppression list is empty)');
      for (const s of list) console.log(`${s.email}\t${s.date}\t${s.reason || ''}`);
    } else {
      console.error('Usage: node outreach/suppression.js add <email> [reason] | remove <email> | list');
      process.exit(1);
    }
  })().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
