// Outreach composer: preview → edit → explicit confirm → send → log.
// Nothing leaves without the operator reading it.
//
// First contact runs the A/B pitch experiment: "auto" lets the server assign
// (sticky per prospect, balanced across the pipeline); A/B force a pitch.
// The variant shown in the preview is pinned on send — what you read is what
// goes out, even if the balance shifted in between.

const outreachState = { projectId: null, preview: null, variantChoice: '' };

const O = (id) => document.getElementById(id);

async function openOutreach(projectId, template = null) {
  outreachState.projectId = projectId;
  outreachState.variantChoice = '';
  O('o-confirm').checked = false;
  O('o-send').disabled = true;
  if (template) O('o-template').value = template;
  syncVariantChips();
  O('outreach-overlay').classList.add('open');
  await refreshPreview();
}

function syncVariantChips() {
  const isFirstContact = O('o-template').value === 'first-contact';
  O('o-variant-field').style.display = isFirstContact ? '' : 'none';
  document.querySelectorAll('#o-variant-field .chip').forEach((c) => {
    c.classList.toggle('on', c.dataset.variant === outreachState.variantChoice);
  });
}

async function refreshPreview() {
  const tpl = O('o-template').value;
  const toOverride = O('o-to').dataset.touched === '1' ? O('o-to').value.trim() : null;
  syncVariantChips();
  try {
    const p = await api.post('/api/outreach/preview', {
      projectId: outreachState.projectId,
      template: tpl,
      variant: outreachState.variantChoice || undefined,
      to: toOverride || undefined,
    });
    outreachState.preview = p;
    O('o-to').value = p.to || '';
    O('o-subject').value = p.subject;
    O('o-text').value = p.text;
    O('o-preview').srcdoc = p.html;
    O('o-variant-info').textContent = p.variant
      ? `→ variante ${p.variant.toUpperCase()}${p.sticky ? ' (fijada: este prospecto ya la recibió)' : ''}`
      : '';
    O('outreach-warnings').innerHTML = p.warnings.length
      ? `<div class="warn-banner">${p.warnings.map(esc).join('<br>')}</div>`
      : '';
  } catch (err) {
    O('outreach-warnings').innerHTML = `<div class="err-banner">${esc(err.message)}</div>`;
  }
}

// If the operator edited the plain text, rebuild a minimal HTML body from it
// so both parts say the same thing.
function textToHtml(text) {
  const paras = text.split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 16px;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:24px;background:#f6f7f9;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a2e;">${paras}</div></body></html>`;
}

async function sendOutreach() {
  const p = outreachState.preview;
  if (!p) return;
  const edited = {
    projectId: outreachState.projectId,
    template: p.template,
    // Pin the previewed variant: what the operator read is what is sent
    variant: p.variant || undefined,
    to: O('o-to').value.trim() || undefined,
    subject: O('o-subject').value.trim(),
    confirm: true,
  };
  if (O('o-text').value !== p.text) {
    edited.text = O('o-text').value;
    edited.html = textToHtml(O('o-text').value);
  }
  O('o-send').disabled = true;
  try {
    const result = await api.post('/api/outreach/send', edited);
    toast(`Enviado a ${result.to}${result.variant ? ` (variante ${result.variant.toUpperCase()})` : ''}`, 'ok');
    O('outreach-overlay').classList.remove('open');
    await loadPipeline();
    if (typeof reloadProject === 'function') reloadProject();
  } catch (err) {
    const hint = err.hint ? ` — ${err.hint}` : '';
    O('outreach-warnings').innerHTML = `<div class="err-banner">${esc(err.message)}${esc(hint)}</div>`;
    O('o-send').disabled = !O('o-confirm').checked;
  }
}

// ── Follow-ups due + suppression entry point (pipeline view bar) ──────────

async function loadFollowups() {
  const bar = O('followups-bar');
  if (!bar) return;
  try {
    const [due, queue, suppression] = await Promise.all([
      api.get('/api/outreach/followups'),
      api.get('/api/outreach/queue'),
      api.get('/api/outreach/suppression'),
    ]);
    const dueItems = due.map((d) => `
      <button class="chip followup-chip" data-id="${esc(d.id)}" data-template="follow-up" title="${esc(d.to || 'sin email')}">
        ✉ ${esc(d.nombre)} · toque ${d.touches + 1} · hace ${d.daysSinceLast} d${d.variant ? ` · ${d.variant.toUpperCase()}` : ''}
      </button>`).join('');
    const queueItems = queue.map((q) => `
      <button class="chip followup-chip" data-id="${esc(q.id)}" data-template="first-contact" title="${esc(q.to)}">
        ☆ ${esc(q.nombre)}
      </button>`).join('');
    bar.innerHTML = `
      <span class="${due.length ? 'due-label' : 'muted'}">${due.length
        ? `${due.length} seguimiento${due.length > 1 ? 's' : ''} pendiente${due.length > 1 ? 's' : ''}:`
        : 'Sin seguimientos pendientes'}</span>
      ${dueItems}
      ${queue.length ? `<span class="due-label" style="margin-left:var(--s3)">· cola 1er contacto (${queue.length}):</span>${queueItems}` : ''}
      <span class="spacer"></span>
      <button class="chip" id="btn-suppression">Bajas (${suppression.length})</button>`;
    bar.querySelectorAll('.followup-chip').forEach((b) => {
      b.addEventListener('click', () => openOutreach(b.dataset.id, b.dataset.template));
    });
    const sup = document.getElementById('btn-suppression');
    if (sup) sup.addEventListener('click', openSuppression);
  } catch {
    bar.innerHTML = '';
  }
}

async function openSuppression() {
  O('suppression-overlay').classList.add('open');
  await renderSuppressionList();
}

async function renderSuppressionList() {
  const list = await api.get('/api/outreach/suppression');
  O('suppression-list').innerHTML = list.length
    ? list.map((s) => `
        <div class="suppression-row">
          <span class="mono">${esc(s.email)}</span>
          <span class="muted">${esc((s.date || '').slice(0, 10))}${s.reason ? ` · ${esc(s.reason)}` : ''}</span>
          <span class="spacer"></span>
          <button class="btn sm danger" data-email="${esc(s.email)}">Quitar</button>
        </div>`).join('')
    : '<p class="muted" style="font-size:13px">(vacía)</p>';
  O('suppression-list').querySelectorAll('button[data-email]').forEach((b) => {
    b.addEventListener('click', async () => {
      await api.del('/api/outreach/suppression', { email: b.dataset.email });
      await renderSuppressionList();
      await loadFollowups();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  O('o-template').addEventListener('change', refreshPreview);
  O('o-to').addEventListener('input', () => { O('o-to').dataset.touched = '1'; });
  O('o-confirm').addEventListener('change', (e) => { O('o-send').disabled = !e.target.checked; });
  O('o-cancel').addEventListener('click', () => O('outreach-overlay').classList.remove('open'));
  O('o-send').addEventListener('click', sendOutreach);
  O('outreach-overlay').addEventListener('click', (e) => {
    if (e.target === O('outreach-overlay')) O('outreach-overlay').classList.remove('open');
  });

  document.querySelectorAll('#o-variant-field .chip').forEach((c) => {
    c.addEventListener('click', () => {
      outreachState.variantChoice = c.dataset.variant;
      refreshPreview();
    });
  });

  O('s-close').addEventListener('click', () => O('suppression-overlay').classList.remove('open'));
  O('suppression-overlay').addEventListener('click', (e) => {
    if (e.target === O('suppression-overlay')) O('suppression-overlay').classList.remove('open');
  });
  O('s-add').addEventListener('click', async () => {
    const email = O('s-email').value.trim();
    if (!email) return;
    await api.post('/api/outreach/suppression', { email });
    O('s-email').value = '';
    await renderSuppressionList();
    await loadFollowups();
  });
});
