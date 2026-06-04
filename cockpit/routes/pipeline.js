// Pipeline CRUD over projects/pipeline.json. PATCH is per-entry — the cockpit
// never overwrites the whole array like the legacy servers did.

const path = require('path');
const { loadJSON, updateJSON } = require('../../lib/json-store');
const { httpError } = require('../router');

const PIPELINE = () => path.join(process.cwd(), 'projects', 'pipeline.json');

const FASES = ['prospecto', 'contactado', 'propuesta', 'negociando', 'aceptado', 'entregado', 'cobrado', 'descartado'];
const EDITABLE = ['nombre', 'tipo', 'url', 'ciudad', 'fase', 'showcaseUrl', 'publicUrl', 'presupuesto', 'cobrado', 'notas', 'email'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function list() {
  return { fases: FASES, entries: loadJSON(PIPELINE(), []) };
}

async function patch({ params, body }) {
  if (!body) throw httpError(400, 'Missing body');
  if (body.fase && !FASES.includes(body.fase)) throw httpError(400, `Invalid fase "${body.fase}"`);
  let found = null;
  await updateJSON(PIPELINE(), (entries) => {
    const entry = (entries || []).find((p) => p.id === params.id);
    if (!entry) return entries || [];
    for (const key of EDITABLE) {
      if (key in body) entry[key] = body[key];
    }
    entry.ultimaAccion = today();
    found = entry;
  }, []);
  if (!found) throw httpError(404, `No pipeline entry "${params.id}"`);
  return found;
}

async function create({ body }) {
  if (!body || !body.nombre) throw httpError(400, 'Missing "nombre"');
  const id = body.id || body.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const entry = {
    id,
    nombre: body.nombre,
    tipo: body.tipo || '',
    url: body.url || '',
    ciudad: body.ciudad || '',
    fase: FASES.includes(body.fase) ? body.fase : 'prospecto',
    fechaInicio: today(),
    ultimaAccion: today(),
    showcaseUrl: '',
    presupuesto: null,
    cobrado: false,
    notas: body.notas || '',
  };
  await updateJSON(PIPELINE(), (entries) => {
    const all = entries || [];
    if (all.some((p) => p.id === id)) throw httpError(409, `Pipeline entry "${id}" already exists`);
    all.push(entry);
    return all;
  }, []);
  return entry;
}

async function remove({ params }) {
  let removed = false;
  await updateJSON(PIPELINE(), (entries) => {
    const all = entries || [];
    const i = all.findIndex((p) => p.id === params.id);
    if (i !== -1) { all.splice(i, 1); removed = true; }
    return all;
  }, []);
  if (!removed) throw httpError(404, `No pipeline entry "${params.id}"`);
  return { removed: params.id };
}

module.exports = { list, patch, create, remove, FASES };
