// Record sent outreach in the project's pipeline entry. Only called after a
// successful send — failed sends leave no trace.

const path = require('path');
const { updateJSON } = require('../lib/json-store');

async function logOutreach(projectId, { to, subject, template, variant, messageId }) {
  const pipelinePath = path.join(process.cwd(), 'projects', 'pipeline.json');
  return updateJSON(pipelinePath, (pipeline) => {
    const entry = (pipeline || []).find((p) => p.id === projectId);
    if (!entry) return pipeline || [];
    if (!Array.isArray(entry.outreach)) entry.outreach = [];
    const record = { date: new Date().toISOString(), to, subject, template, messageId };
    // A/B experiment bookkeeping: which first-contact pitch this prospect got
    if (variant) record.variant = variant;
    entry.outreach.push(record);
    // A sent email IS the contact — advance the funnel so followups.js sees it
    if (entry.fase === 'prospecto') entry.fase = 'contactado';
    entry.ultimaAccion = new Date().toISOString().slice(0, 10);
  }, []);
}

module.exports = { logOutreach };
