// Prospects ledger: dense rows, text filters, chip toggles, row actions
// (find email, promote to pipeline).

let prospects = [];
const filters = { text: '', chips: new Set() };

async function loadProspects() {
  const data = await api.get('/api/prospects');
  prospects = data.prospects;
  renderLedger();
}

function prospectMatches(p) {
  if (filters.text) {
    const t = filters.text.toLowerCase();
    if (!(`${p.name} ${p.zone || ''} ${p.address || ''}`.toLowerCase().includes(t))) return false;
  }
  if (filters.chips.has('con-web') && !p.website) return false;
  if (filters.chips.has('sin-web') && p.website) return false;
  if (filters.chips.has('con-email') && !p.email) return false;
  return true;
}

function ratingHtml(p) {
  if (!p.rating) return '<span class="muted">—</span>';
  return `<span class="rating">★ ${p.rating.toFixed(1)} <span class="n">(${p.totalReviews || 0})</span></span>`;
}

function rowHtml(p) {
  const contact = [];
  if (p.website) contact.push(`<a class="badge" href="${esc(p.website)}" target="_blank" rel="noopener">web</a>`);
  if (p.email) contact.push(`<span class="badge live">✉ ${esc(p.email)}</span>`);
  if (p.phone) contact.push(`<span class="badge dim">${esc(p.phone)}</span>`);
  if (p.pipelineId) contact.push(`<span class="badge amber">en pipeline</span>`);

  const actions = [];
  if (p.website && !p.email) actions.push(`<button class="btn sm" data-act="enrich" data-id="${esc(p.id)}">buscar email</button>`);
  if (!p.pipelineId) actions.push(`<button class="btn sm" data-act="promote" data-id="${esc(p.id)}">→ pipeline</button>`);

  return `
    <div class="row">
      <span class="name" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="zone">${esc(p.zone || '')}</span>
      ${ratingHtml(p)}
      <span class="contact">${contact.join('')}</span>
      <span class="actions">${actions.join('')}</span>
    </div>`;
}

function renderLedger() {
  const list = prospects.filter(prospectMatches);
  const ledger = document.getElementById('ledger');
  document.getElementById('p-count').textContent = `${list.length} de ${prospects.length}`;
  ledger.innerHTML = list.length
    ? list.map(rowHtml).join('')
    : '<div class="ledger-empty">Nada por aquí — ajusta los filtros o lanza una búsqueda de zona.</div>';

  ledger.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = prospects.find((x) => x.id === btn.dataset.id);
      if (btn.dataset.act === 'enrich') enrichOne(p);
      if (btn.dataset.act === 'promote') promote(p);
    });
  });
}

function enrichOne(p) {
  runJob('enrich-emails', { id: p.id }, {
    title: `buscar email · ${p.name}`,
    onEnd: async (status) => { if (status === 'done') { await loadProspects(); toast('Prospectos actualizados', 'ok'); } },
  });
}

async function promote(p) {
  try {
    const entry = await api.post('/api/pipeline', {
      nombre: p.name,
      tipo: p.category || (p.types || [])[0] || '',
      url: p.website || '',
      ciudad: p.zone || '',
      notas: `Desde prospección (${p.searchQuery || 's/d'}). Rating ${p.rating ?? 's/d'} (${p.totalReviews ?? 0}).`,
    });
    await api.patch(`/api/prospects/${p.id}`, { status: 'in-pipeline', pipelineId: entry.id });
    toast(`${p.name} → pipeline`, 'ok');
    await Promise.all([loadProspects(), loadPipeline()]);
  } catch (err) {
    toast(err.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('p-search').addEventListener('input', (e) => {
    filters.text = e.target.value;
    renderLedger();
  });
  document.querySelectorAll('#prospect-toolbar .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.filter;
      // con-web / sin-web are mutually exclusive
      if (key === 'con-web') filters.chips.delete('sin-web');
      if (key === 'sin-web') filters.chips.delete('con-web');
      filters.chips.has(key) ? filters.chips.delete(key) : filters.chips.add(key);
      document.querySelectorAll('#prospect-toolbar .chip').forEach((c) =>
        c.classList.toggle('on', filters.chips.has(c.dataset.filter)));
      renderLedger();
    });
  });
  document.getElementById('btn-enrich-all').addEventListener('click', () => {
    runJob('enrich-emails', { limit: 20 }, {
      title: 'buscar emails · pendientes (20)',
      onEnd: async (status) => { if (status === 'done') { await loadProspects(); toast('Prospectos actualizados', 'ok'); } },
    });
  });
});
