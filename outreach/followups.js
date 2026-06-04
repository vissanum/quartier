#!/usr/bin/env node
// Which prospects are due a follow-up touch. Pure read — never sends.
// The operator (or the cockpit) decides; >50% of replies come from
// follow-ups, so this list is where half the pipeline's value lives.
//
// A prospect is due when ALL of:
//   - it has at least one outreach touch logged
//   - fase is "contactado" (a reply moves it forward / "descartado" — both
//     drop it off this list naturally)
//   - the last touch is ≥ --days old (default 4)
//   - it has had < --max touches total (default 3 = first contact + 2)
//   - its email is not on the suppression list ("BAJA" is forever)
//
// CLI: node outreach/followups.js [--days 4] [--max 3]

const path = require('path');
const { loadJSON } = require('../lib/json-store');
const { isSuppressed } = require('./suppression');
const { resolveRecipient } = require('./compose');
const { TEMPLATE_TO_VARIANT } = require('./variants');

function dueFollowUps({ days = 4, maxTouches = 3, now = new Date() } = {}) {
  const pipeline = loadJSON(path.join(process.cwd(), 'projects', 'pipeline.json'), []);
  const due = [];
  for (const entry of pipeline) {
    const touches = entry.outreach || [];
    if (!touches.length) continue;
    if (entry.fase !== 'contactado') continue;
    if (touches.length >= maxTouches) continue;
    const last = new Date(touches[touches.length - 1].date);
    const daysSinceLast = Math.floor((now - last) / 86400000);
    if (daysSinceLast < days) continue;
    const to = resolveRecipient(entry.id);
    if (to && isSuppressed(to)) continue;
    due.push({
      id: entry.id,
      nombre: entry.nombre,
      to,
      touches: touches.length,
      daysSinceLast,
      variant: touches.map((t) => t.variant || TEMPLATE_TO_VARIANT[t.template]).find(Boolean) || null,
      lastSubject: touches[touches.length - 1].subject || null,
    });
  }
  return due.sort((x, y) => y.daysSinceLast - x.daysSinceLast);
}

// Prospects ready for their FIRST touch: still "prospecto", with a recipient
// and a live demo. This is the send queue for a batch — the cockpit renders
// it; the operator fires each one deliberately.
function readyForFirstContact() {
  const pipeline = loadJSON(path.join(process.cwd(), 'projects', 'pipeline.json'), []);
  const ready = [];
  for (const entry of pipeline) {
    if (entry.fase !== 'prospecto') continue;
    if ((entry.outreach || []).length) continue;
    const to = resolveRecipient(entry.id);
    if (!to || isSuppressed(to)) continue;
    if (!entry.publicUrl) continue;
    ready.push({ id: entry.id, nombre: entry.nombre, to, publicUrl: entry.publicUrl });
  }
  return ready;
}

module.exports = { dueFollowUps, readyForFirstContact };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    const v = i !== -1 ? parseInt(args[i + 1], 10) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };
  const due = dueFollowUps({ days: flag('--days', 4), maxTouches: flag('--max', 3) });
  if (!due.length) {
    console.log('No follow-ups due.');
    return;
  }
  console.log(`${due.length} follow-up(s) due:\n`);
  for (const d of due) {
    console.log(`  ${d.id}  (${d.nombre})  — toque ${d.touches + 1}, último hace ${d.daysSinceLast} días, variante ${d.variant || '?'}, to: ${d.to || 'SIN EMAIL'}`);
    console.log(`    → node outreach/send.js ${d.id} --template follow-up`);
  }
}
