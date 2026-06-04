// Build a ready-to-review outreach email for a pipeline project: gathers the
// pipeline entry, the project config and the linked prospect, resolves the
// recipient and renders the chosen template. Pure — no sending here.

const path = require('path');
const config = require('../lib/load-env');
const { loadJSON } = require('../lib/json-store');
const { TEMPLATES } = require('./templates');

// Recipient priority: manual override → curated project config → pipeline
// entry → enriched prospect. Shared with followups.js so the due list and
// the actual send always agree on who gets the email.
function resolveRecipient(projectId, toOverride = null) {
  const root = process.cwd();
  const projectConfig = loadJSON(path.join(root, 'projects', projectId, 'config.json'), {});
  const pipeline = loadJSON(path.join(root, 'projects', 'pipeline.json'), []);
  const entry = pipeline.find((p) => p.id === projectId) || {};
  const prospects = loadJSON(path.join(root, 'prospects', 'prospects.json'), []);
  const prospect = prospects.find((p) => p.pipelineId === projectId) || null;
  return toOverride || projectConfig.email || entry.email || (prospect && prospect.email) || null;
}

function composeForProject(projectId, { template = 'first-contact', to: toOverride = null } = {}) {
  const root = process.cwd();
  const builder = TEMPLATES[template];
  if (!builder) throw new Error(`Unknown template "${template}" (available: ${Object.keys(TEMPLATES).join(', ')})`);

  const pipeline = loadJSON(path.join(root, 'projects', 'pipeline.json'), []);
  const entry = pipeline.find((p) => p.id === projectId);
  if (!entry) throw new Error(`No pipeline entry for "${projectId}"`);

  const projectConfig = loadJSON(path.join(root, 'projects', projectId, 'config.json'), {});

  const warnings = [];
  const to = resolveRecipient(projectId, toOverride);
  if (!to) {
    warnings.push('No recipient email: run enrich-emails, fill projects/' + projectId + '/config.json "email", or pass one explicitly');
  }
  const publicUrl = entry.publicUrl || null;
  if (!publicUrl) {
    warnings.push(`No public demo URL: deploy first (node deploy/publish.js ${projectId})`);
  }

  const { subject, html, text } = builder({ entry, projectConfig, operator: config, publicUrl: publicUrl || '[DEMO-URL-PENDIENTE]' });
  return { projectId, template, to, subject, html, text, warnings };
}

module.exports = { composeForProject, resolveRecipient };
