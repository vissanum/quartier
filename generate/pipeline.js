#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PIPELINE_FILE = path.join(process.cwd(), 'projects', 'pipeline.json');
const OUTPUT_FILE = path.join(process.cwd(), 'pipeline.html');

const operator = require('../lib/load-env');

const FASES = [
  { id: 'prospecto', label: 'Prospecto', color: '#6b7280', bg: '#f3f4f6' },
  { id: 'contactado', label: 'Contactado', color: '#3b82f6', bg: '#eff6ff' },
  { id: 'propuesta', label: 'Propuesta enviada', color: '#f59e0b', bg: '#fffbeb' },
  { id: 'negociando', label: 'Negociando', color: '#8b5cf6', bg: '#f5f3ff' },
  { id: 'aceptado', label: 'Aceptado', color: '#10b981', bg: '#ecfdf5' },
  { id: 'entregado', label: 'Entregado', color: '#06b6d4', bg: '#ecfeff' },
  { id: 'cobrado', label: 'Cobrado', color: '#059669', bg: '#d1fae5' },
  { id: 'descartado', label: 'Descartado', color: '#ef4444', bg: '#fef2f2' },
];

function run() {
  if (!fs.existsSync(PIPELINE_FILE)) {
    console.error('No se encuentra projects/pipeline.json');
    process.exit(1);
  }

  const proyectos = JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf-8'));
  const ahora = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  // Stats
  const activos = proyectos.filter(p => !['descartado', 'cobrado'].includes(p.fase)).length;
  const cobrados = proyectos.filter(p => p.fase === 'cobrado').length;
  const totalPresupuestado = proyectos.reduce((s, p) => s + (p.presupuesto || 0), 0);
  const totalCobrado = proyectos.filter(p => p.cobrado).reduce((s, p) => s + (p.presupuesto || 0), 0);

  // Cards por fase
  const columnas = FASES.map(fase => {
    const items = proyectos.filter(p => p.fase === fase.id);
    const cards = items.map(p => `
              <div class="card">
                <div class="card-header">
                  <span class="card-name">${p.nombre}</span>
                  <span class="card-type">${p.tipo}</span>
                </div>
                <div class="card-city">${p.ciudad}</div>
                ${p.url ? `<a class="card-url" href="${p.url}" target="_blank">${p.url.replace('https://www.', '').replace('https://', '')}</a>` : ''}
                ${p.presupuesto ? `<div class="card-price">${p.presupuesto} &euro;</div>` : ''}
                ${p.notas ? `<div class="card-notes">${p.notas}</div>` : ''}
                <div class="card-dates">
                  <span>Inicio: ${p.fechaInicio}</span>
                  <span>Última: ${p.ultimaAccion}</span>
                </div>
                ${p.showcaseUrl ? `<a class="card-showcase" href="${operator.showcaseBaseUrl}/${p.showcaseUrl}" target="_blank">Ver showcase</a>` : ''}
              </div>`).join('');

    return `
          <div class="column">
            <div class="column-header" style="border-top-color:${fase.color}">
              <span class="column-title">${fase.label}</span>
              <span class="column-count" style="background:${fase.bg};color:${fase.color}">${items.length}</span>
            </div>
            <div class="column-body">
              ${cards || '<div class="empty">Sin proyectos</div>'}
            </div>
          </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Pipeline — Redisenos Web</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: #0f172a; color: #e2e8f0; min-height: 100vh;
        }

        .topbar {
            background: #1e293b; border-bottom: 1px solid #334155;
            padding: 20px 28px; display: flex; align-items: center; justify-content: space-between;
            flex-wrap: wrap; gap: 16px;
        }
        .topbar h1 { font-size: 1.25rem; font-weight: 700; color: #f8fafc; }
        .topbar h1 span { color: #f59e0b; }
        .topbar-date { font-size: 0.8rem; color: #94a3b8; }

        .stats {
            display: flex; gap: 12px; padding: 20px 28px; flex-wrap: wrap;
        }
        .stat {
            background: #1e293b; border: 1px solid #334155; border-radius: 10px;
            padding: 16px 22px; min-width: 160px; flex: 1;
        }
        .stat-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 4px; }
        .stat-value { font-size: 1.5rem; font-weight: 700; color: #f8fafc; }
        .stat-value.green { color: #34d399; }
        .stat-value.amber { color: #fbbf24; }

        .board {
            display: flex; gap: 12px; padding: 12px 28px 28px;
            overflow-x: auto; align-items: flex-start;
        }

        .column {
            min-width: 240px; max-width: 280px; flex-shrink: 0;
            background: #1e293b; border: 1px solid #334155; border-radius: 10px;
            overflow: hidden;
        }
        .column-header {
            padding: 14px 16px; border-top: 3px solid; display: flex;
            align-items: center; justify-content: space-between;
            background: rgba(255,255,255,0.02);
        }
        .column-title { font-size: 0.82rem; font-weight: 700; color: #f1f5f9; }
        .column-count {
            font-size: 0.7rem; font-weight: 700; padding: 2px 8px;
            border-radius: 10px; min-width: 22px; text-align: center;
        }
        .column-body { padding: 8px; display: flex; flex-direction: column; gap: 8px; min-height: 60px; }

        .card {
            background: #0f172a; border: 1px solid #334155; border-radius: 8px;
            padding: 14px; transition: border-color .2s;
        }
        .card:hover { border-color: #f59e0b; }
        .card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
        .card-name { font-size: 0.9rem; font-weight: 700; color: #f8fafc; }
        .card-type {
            font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em;
            color: #94a3b8; background: #334155; padding: 2px 8px; border-radius: 4px;
            white-space: nowrap; flex-shrink: 0;
        }
        .card-city { font-size: 0.78rem; color: #94a3b8; margin-bottom: 6px; }
        .card-url { font-size: 0.75rem; color: #60a5fa; display: block; margin-bottom: 6px; text-decoration: none; word-break: break-all; }
        .card-url:hover { text-decoration: underline; }
        .card-price { font-size: 1rem; font-weight: 700; color: #34d399; margin: 8px 0; }
        .card-notes { font-size: 0.75rem; color: #94a3b8; line-height: 1.5; margin-bottom: 8px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 4px; }
        .card-dates { display: flex; justify-content: space-between; font-size: 0.68rem; color: #64748b; margin-top: 8px; }
        .card-showcase {
            display: block; text-align: center; margin-top: 10px; padding: 7px 12px;
            background: rgba(245,158,11,0.1); color: #f59e0b; border-radius: 6px;
            font-size: 0.75rem; font-weight: 600; text-decoration: none;
            transition: background .2s;
        }
        .card-showcase:hover { background: rgba(245,158,11,0.2); }

        .empty { font-size: 0.78rem; color: #475569; text-align: center; padding: 20px 8px; font-style: italic; }

        @media (max-width: 768px) {
            .board { flex-direction: column; align-items: stretch; }
            .column { max-width: 100%; min-width: auto; }
            .stats { flex-direction: column; }
        }
    </style>
</head>
<body>

    <div class="topbar">
        <h1><span>Pipeline</span> — Redisenos Web</h1>
        <span class="topbar-date">Generado: ${ahora}</span>
    </div>

    <div class="stats">
        <div class="stat">
            <div class="stat-label">Total proyectos</div>
            <div class="stat-value">${proyectos.length}</div>
        </div>
        <div class="stat">
            <div class="stat-label">Activos</div>
            <div class="stat-value amber">${activos}</div>
        </div>
        <div class="stat">
            <div class="stat-label">Cobrados</div>
            <div class="stat-value green">${cobrados}</div>
        </div>
        <div class="stat">
            <div class="stat-label">Facturado</div>
            <div class="stat-value green">${totalCobrado > 0 ? totalCobrado + ' &euro;' : '—'}</div>
        </div>
    </div>

    <div class="board">
        ${columnas}
    </div>

</body>
</html>`;

  fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');
  console.log(`Pipeline generado: ${OUTPUT_FILE}`);
  console.log(`  ${proyectos.length} proyectos | ${activos} activos | ${cobrados} cobrados`);
}

run();
