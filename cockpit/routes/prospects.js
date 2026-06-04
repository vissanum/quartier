// Prospects browsing and per-entry updates over prospects/prospects.json.

const path = require('path');
const { loadJSON, updateJSON } = require('../../lib/json-store');
const { httpError } = require('../router');

const PROSPECTS = () => path.join(process.cwd(), 'prospects', 'prospects.json');
const SEARCHES = () => path.join(process.cwd(), 'prospects', 'searches.json');

const EDITABLE = ['status', 'claudeNotes', 'email', 'pipelineId', 'category'];

function list() {
  return {
    prospects: loadJSON(PROSPECTS(), []),
    searches: loadJSON(SEARCHES(), []),
  };
}

async function patch({ params, body }) {
  if (!body) throw httpError(400, 'Missing body');
  let found = null;
  await updateJSON(PROSPECTS(), (entries) => {
    const entry = (entries || []).find((p) => p.id === params.id);
    if (!entry) return entries || [];
    for (const key of EDITABLE) {
      if (key in body) entry[key] = body[key];
    }
    found = entry;
  }, []);
  if (!found) throw httpError(404, `No prospect "${params.id}"`);
  return found;
}

module.exports = { list, patch };
