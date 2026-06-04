// First-contact A/B variant resolution, shared by the send.js CLI and the
// cockpit outreach routes so both paths assign pitches the same way.
//
// Priority: variant already sent to this prospect (sticky — follow-ups and
// re-previews must not flip the pitch) → explicit request → auto-balance
// across the whole pipeline (tie goes to 'a', the control).

const path = require('path');
const { loadJSON } = require('../lib/json-store');
const { FIRST_CONTACT_VARIANTS } = require('./templates');

const TEMPLATE_TO_VARIANT = Object.fromEntries(
  Object.entries(FIRST_CONTACT_VARIANTS).map(([v, t]) => [t, v])
);

function resolveVariant(projectId, explicit, root = process.cwd()) {
  const pipeline = loadJSON(path.join(root, 'projects', 'pipeline.json'), []);
  const entry = pipeline.find((p) => p.id === projectId);
  const prior = ((entry && entry.outreach) || [])
    .map((o) => o.variant || TEMPLATE_TO_VARIANT[o.template])
    .find(Boolean);
  if (prior) return { variant: prior, sticky: true };
  if (explicit) return { variant: explicit, sticky: false };
  const counts = { a: 0, b: 0 };
  for (const e of pipeline) {
    for (const o of e.outreach || []) {
      const v = o.variant || TEMPLATE_TO_VARIANT[o.template];
      if (v in counts) counts[v]++;
    }
  }
  return { variant: counts.b < counts.a ? 'b' : 'a', sticky: false };
}

module.exports = { resolveVariant, TEMPLATE_TO_VARIANT, FIRST_CONTACT_VARIANTS };
