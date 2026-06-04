// Project workbench: readiness checklist, job buttons with live console,
// deploy, outreach entry point.

let currentProject = null;

async function loadProject(id) {
  const body = document.getElementById('proyecto-body');
  try {
    currentProject = await api.get(`/api/projects/${id}`);
  } catch (err) {
    // Pipeline entry without project files yet
    const entry = pipelineEntries.find((p) => p.id === id);
    body.innerHTML = `
      <div class="proj-head">
        <button class="back" onclick="location.hash='#/pipeline'">← pipeline</button>
        <h1>${esc(entry ? entry.nombre : id)}</h1>
      </div>
      <div class="panel">
        <h2>Sin archivos de proyecto</h2>
        <p class="muted">Aún no se ha descargado la web original. Lanza el scrape para empezar.</p>
        ${entry && entry.url ? `<button class="btn primary" id="btn-first-scrape">Descargar sitio (scrape)</button>` : '<p class="muted">No hay URL en el pipeline.</p>'}
      </div>`;
    const btn = document.getElementById('btn-first-scrape');
    if (btn) btn.addEventListener('click', () =>
      runJob('scrape', { url: entry.url, name: id }, { title: `scrape · ${entry.nombre}`, onEnd: () => loadProject(id) }));
    return;
  }
  renderProject();
}

function reloadProject() {
  if (currentProject) loadProject(currentProject.id);
}

function check(ok, label) {
  return `<div class="item"><span class="${ok ? 'ok' : 'ko'}">${ok ? '●' : '○'}</span> ${label}</div>`;
}

function renderProject() {
  const d = currentProject;
  const e = d.pipeline || {};
  const f = d.files;
  const jobBtn = (job, args, label, hint, enabled = true) =>
    `<button class="action-btn" data-job="${job}" data-args='${esc(JSON.stringify(args))}' ${enabled ? '' : 'disabled'}>${label}<span class="hint">${hint}</span></button>`;

  document.getElementById('proyecto-body').innerHTML = `
    <div class="proj-head">
      <button class="back" onclick="location.hash='#/pipeline'">← pipeline</button>
      <h1>${esc(e.nombre || d.id)}</h1>
      <span class="badge" style="--awning:var(--awn-${esc(e.fase || 'prospecto')})">${esc(e.fase || 'sin pipeline')}</span>
      <div class="links">
        ${e.publicUrl ? `<a href="${esc(e.publicUrl)}" target="_blank" rel="noopener">demo pública ↗</a>` : ''}
        ${f.showcase ? `<a href="/projects/${esc(d.id)}/showcase.html" target="_blank">showcase local ↗</a>` : ''}
        ${f.redesignIndex ? `<a href="/projects/${esc(d.id)}/redesign/index.html" target="_blank">rediseño local ↗</a>` : ''}
        ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">web original ↗</a>` : ''}
      </div>
    </div>

    <div class="proj-grid">
      <div>
        <div class="panel" style="margin-bottom: var(--s4);">
          <h2>Banco de trabajo</h2>
          <div class="actions-grid">
            ${jobBtn('scrape', { url: e.url, name: d.id }, 'Scrape', 'descargar sitio original', !!e.url)}
            ${jobBtn('google-places', { business: e.nombre, city: e.ciudad, name: d.id }, 'Google Places', 'reseñas y fotos', !!(e.nombre && e.ciudad))}
            ${jobBtn('generate-site', { name: d.id }, 'Generar rediseño', 'desde config.json', d.readiness.canGenerate)}
            ${jobBtn('generate-report', { name: d.id }, 'Informe', 'auditoría para el cliente', f.config)}
            ${jobBtn('validate-html', { name: d.id }, 'Validar HTML', 'W3C checker', f.redesignIndex)}
            ${jobBtn('optimize-images', { name: d.id }, 'Optimizar imágenes', 'jpg + escala', f.redesignIndex)}
          </div>
        </div>

        <div class="panel">
          <h2>Publicar y vender</h2>
          <div class="actions-grid">
            <button class="action-btn" id="btn-deploy" ${d.readiness.canDeploy ? '' : 'disabled'}>
              Deploy demo<span class="hint">commit + push → web pública</span>
            </button>
            <button class="action-btn" id="btn-deploy-dry" ${d.readiness.canDeploy ? '' : 'disabled'}>
              Deploy (sin push)<span class="hint">solo construir y commitear</span>
            </button>
            <button class="action-btn" id="btn-outreach" ${d.readiness.canOutreach ? '' : 'disabled'}>
              Redactar correo<span class="hint">${d.readiness.canOutreach ? esc(d.readiness.email) : 'necesita demo pública + email'}</span>
            </button>
          </div>
          ${(e.outreach || []).length ? `
            <h2 style="margin-top:var(--s4)">Correos enviados</h2>
            <div class="checklist">
              ${e.outreach.map((o) => `<div class="item mono" style="font-size:12px">${esc(o.date.slice(0, 16).replace('T', ' '))} → ${esc(o.to)} <span class="muted">(${esc(o.template)})</span></div>`).join('')}
            </div>` : ''}
        </div>
      </div>

      <div>
        <div class="panel" style="margin-bottom: var(--s4);">
          <h2>Estado</h2>
          <div class="checklist">
            ${check(f.sitemap, 'Sitio original descargado')}
            ${check(f.config, 'config.json creado')}
            ${check(f.redesignIndex, `Rediseño (${f.redesignPages} páginas)`)}
            ${check(f.showcase, 'Showcase antes/después')}
            ${check(f.screenshotDesktop && f.screenshotMobile, 'Capturas desktop + móvil')}
            ${check(!!e.publicUrl, 'Demo pública desplegada')}
            ${check(!!d.readiness.email, d.readiness.email ? `Email: ${esc(d.readiness.email)}` : 'Email de contacto')}
            ${check((e.outreach || []).length > 0, 'Primer correo enviado')}
          </div>
        </div>

        <div class="panel">
          <h2>Ficha</h2>
          <dl class="kv">
            <dt>Tipo</dt><dd>${esc(e.tipo || '—')}</dd>
            <dt>Ciudad</dt><dd>${esc(e.ciudad || '—')}</dd>
            <dt>Inicio</dt><dd class="mono">${esc(e.fechaInicio || '—')}</dd>
            <dt>Última acción</dt><dd class="mono">${esc(e.ultimaAccion || '—')}</dd>
            <dt>Presupuesto</dt><dd>${e.presupuesto ? e.presupuesto.toLocaleString('es-ES') + ' €' : '—'}</dd>
            <dt>Notas</dt><dd style="white-space:normal">${esc(e.notas || '—')}</dd>
          </dl>
        </div>
      </div>
    </div>`;

  // Wire workbench buttons
  document.querySelectorAll('#proyecto-body .action-btn[data-job]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const job = btn.dataset.job;
      const args = JSON.parse(btn.dataset.args);
      runJob(job, args, { title: `${job} · ${currentProject.id}`, onEnd: () => reloadProject() });
    });
  });
  const deploy = async (noPush) => {
    try {
      const job = await api.post(`/api/deploy/${currentProject.id}`, { noPush });
      followJob(job, `deploy · ${currentProject.id}${noPush ? ' (sin push)' : ''}`, (status) => {
        if (status === 'done') { toast(noPush ? 'Construido y commiteado (sin push)' : 'Demo publicada — CI desplegando', 'ok'); }
        reloadProject();
        loadPipeline();
      });
    } catch (err) { toast(err.message, 'err'); }
  };
  const btnDeploy = document.getElementById('btn-deploy');
  const btnDeployDry = document.getElementById('btn-deploy-dry');
  const btnOutreach = document.getElementById('btn-outreach');
  if (btnDeploy) btnDeploy.addEventListener('click', () => deploy(false));
  if (btnDeployDry) btnDeployDry.addEventListener('click', () => deploy(true));
  if (btnOutreach) btnOutreach.addEventListener('click', () => openOutreach(currentProject.id));
}
