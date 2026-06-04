// Pipeline board — the street. One column per phase, storefront cards with
// awning + door trail, HTML5 drag-drop → PATCH per entry.

let FASES = [];
let pipelineEntries = [];

async function loadPipeline() {
  const data = await api.get('/api/pipeline');
  FASES = data.fases;
  pipelineEntries = data.entries;
  renderBoard();
  renderStreetSummary();
  // Morning checklist: who is due a follow-up touch (defined in outreach.js)
  if (typeof loadFollowups === 'function') loadFollowups();
}

function renderStreetSummary() {
  const enCalle = pipelineEntries.filter((p) => !['cobrado', 'descartado'].includes(p.fase)).length;
  const demos = pipelineEntries.filter((p) => p.publicUrl).length;
  const cobrado = pipelineEntries.filter((p) => p.cobrado).reduce((s, p) => s + (p.presupuesto || 0), 0);
  document.getElementById('street-summary').innerHTML =
    `<b>${enCalle}</b> en la calle · <b>${demos}</b> demos vivas · <b>${cobrado.toLocaleString('es-ES')} €</b> cobrado`;
}

function trailHtml(fase) {
  const idx = FASES.indexOf(fase);
  return `<span class="trail">${FASES.map((f, i) =>
    `<i class="${i <= idx ? 'done' : ''}" title="${f}"></i>`).join('')}</span>`;
}

function cardHtml(p) {
  const badges = [];
  if (p.publicUrl) badges.push(`<span class="badge live">demo viva</span>`);
  else if (p.showcaseUrl) badges.push(`<span class="badge dim">showcase local</span>`);
  if (p.email) badges.push(`<span class="badge">✉ ${esc(p.email)}</span>`);
  if (p.presupuesto) badges.push(`<span class="badge amber">${p.presupuesto.toLocaleString('es-ES')} €</span>`);
  if ((p.outreach || []).length) badges.push(`<span class="badge">${p.outreach.length} correo${p.outreach.length > 1 ? 's' : ''}</span>`);
  return `
    <article class="card" draggable="true" data-id="${esc(p.id)}" style="--awning: var(--awn-${esc(p.fase)})">
      <div class="nombre">${esc(p.nombre)}</div>
      <div class="meta">${esc(p.tipo || '')}${p.tipo && p.ciudad ? ' · ' : ''}${esc(p.ciudad || '')}</div>
      <div class="badges">${badges.join('')}</div>
      <div class="foot">
        ${trailHtml(p.fase)}
        <span class="fecha" title="última acción">${esc(p.ultimaAccion || '')}</span>
      </div>
    </article>`;
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = FASES.map((fase) => {
    const cards = pipelineEntries.filter((p) => p.fase === fase);
    return `
      <div class="col" data-fase="${fase}">
        <div class="col-head">
          <span class="fase">${fase}</span>
          <span class="count">${cards.length}</span>
        </div>
        <div class="col-cards" data-fase="${fase}">
          ${cards.map(cardHtml).join('')}
        </div>
      </div>`;
  }).join('');

  // Open project on click
  board.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => { location.hash = `#/proyecto/${card.dataset.id}`; });
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  // Drop targets
  board.querySelectorAll('.col-cards').forEach((zone) => {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      const fase = zone.dataset.fase;
      const entry = pipelineEntries.find((p) => p.id === id);
      if (!entry || entry.fase === fase) return;
      const prev = entry.fase;
      entry.fase = fase;
      renderBoard(); // optimistic
      try {
        await api.patch(`/api/pipeline/${id}`, { fase });
        renderStreetSummary();
      } catch (err) {
        entry.fase = prev;
        renderBoard();
        toast(`No se pudo mover: ${err.message}`, 'err');
      }
    });
  });
}
