#!/usr/bin/env node
// DEPRECATED: superseded by the unified cockpit (npm run cockpit → http://localhost:3458).
// Kept one release as a fallback.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const PIPELINE_FILE = path.join(process.cwd(), 'projects', 'pipeline.json');

const operator = require('../lib/load-env');

const FASES = [
  { id: 'prospecto', label: 'Prospecto', color: '#6b7280' },
  { id: 'contactado', label: 'Contactado', color: '#3b82f6' },
  { id: 'propuesta', label: 'Propuesta enviada', color: '#f59e0b' },
  { id: 'negociando', label: 'Negociando', color: '#8b5cf6' },
  { id: 'aceptado', label: 'Aceptado', color: '#10b981' },
  { id: 'entregado', label: 'Entregado', color: '#06b6d4' },
  { id: 'cobrado', label: 'Cobrado', color: '#059669' },
  { id: 'descartado', label: 'Descartado', color: '#ef4444' },
];

function loadProyectos() {
  return JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf-8'));
}

function saveProyectos(data) {
  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function buildHTML(proyectos) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pipeline — Redisenos Web</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: #0f172a; color: #e2e8f0; min-height: 100vh;
            user-select: none;
        }

        .topbar {
            background: #1e293b; border-bottom: 1px solid #334155;
            padding: 20px 28px; display: flex; align-items: center; justify-content: space-between;
            flex-wrap: wrap; gap: 16px; position: sticky; top: 0; z-index: 100;
        }
        .topbar h1 { font-size: 1.25rem; font-weight: 700; color: #f8fafc; }
        .topbar h1 span { color: #f59e0b; }
        .topbar-right { display: flex; align-items: center; gap: 16px; }
        .topbar-date { font-size: 0.8rem; color: #94a3b8; }
        .toast {
            font-size: 0.78rem; padding: 6px 14px; border-radius: 6px;
            background: #065f46; color: #6ee7b7; font-weight: 600;
            opacity: 0; transition: opacity .3s; pointer-events: none;
        }
        .toast.show { opacity: 1; }

        .btn-add {
            background: #f59e0b; color: #0f172a; border: none; padding: 8px 18px;
            border-radius: 8px; font-weight: 700; font-size: 0.82rem; cursor: pointer;
            transition: background .2s;
        }
        .btn-add:hover { background: #d97706; }

        .stats {
            display: flex; gap: 12px; padding: 20px 28px; flex-wrap: wrap;
        }
        .stat {
            background: #1e293b; border: 1px solid #334155; border-radius: 10px;
            padding: 16px 22px; min-width: 140px; flex: 1;
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
            min-width: 240px; width: 240px; flex-shrink: 0;
            background: #1e293b; border: 1px solid #334155; border-radius: 10px;
            overflow: hidden; transition: border-color .2s;
        }
        .column.drag-over { border-color: #f59e0b; background: #1a2436; }
        .column-header {
            padding: 14px 16px; border-top: 3px solid; display: flex;
            align-items: center; justify-content: space-between;
            background: rgba(255,255,255,0.02);
        }
        .column-title { font-size: 0.82rem; font-weight: 700; color: #f1f5f9; }
        .column-count {
            font-size: 0.7rem; font-weight: 700; padding: 2px 8px;
            border-radius: 10px; min-width: 22px; text-align: center;
            background: rgba(255,255,255,0.06); color: inherit;
        }
        .column-body { padding: 8px; display: flex; flex-direction: column; gap: 8px; min-height: 80px; }

        .card {
            background: #0f172a; border: 1px solid #334155; border-radius: 8px;
            padding: 14px; cursor: grab; transition: all .2s;
        }
        .card:active { cursor: grabbing; }
        .card.dragging { opacity: 0.4; transform: scale(0.96); }
        .card:hover { border-color: #475569; }
        .card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
        .card-name { font-size: 0.9rem; font-weight: 700; color: #f8fafc; }
        .card-type {
            font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em;
            color: #94a3b8; background: #334155; padding: 2px 8px; border-radius: 4px;
            white-space: nowrap; flex-shrink: 0;
        }
        .card-city { font-size: 0.78rem; color: #94a3b8; margin-bottom: 4px; }
        .card-url { font-size: 0.75rem; color: #60a5fa; display: block; margin-bottom: 4px; text-decoration: none; word-break: break-all; }
        .card-url:hover { text-decoration: underline; }
        .card-price { font-size: 1rem; font-weight: 700; color: #34d399; margin: 6px 0; }
        .card-notes { font-size: 0.73rem; color: #94a3b8; line-height: 1.5; margin-bottom: 6px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 4px; }
        .card-dates { display: flex; justify-content: space-between; font-size: 0.68rem; color: #64748b; }
        .card-showcase {
            display: block; text-align: center; margin-top: 8px; padding: 6px 12px;
            background: rgba(245,158,11,0.1); color: #f59e0b; border-radius: 6px;
            font-size: 0.73rem; font-weight: 600; text-decoration: none;
        }
        .card-showcase:hover { background: rgba(245,158,11,0.2); }
        .card-delete {
            position: absolute; top: 6px; right: 6px; background: none; border: none;
            color: #475569; cursor: pointer; font-size: 0.9rem; padding: 2px 6px;
            border-radius: 4px; display: none;
        }
        .card-wrapper { position: relative; }
        .card-wrapper:hover .card-delete { display: block; }
        .card-delete:hover { color: #ef4444; background: rgba(239,68,68,0.1); }

        .empty { font-size: 0.78rem; color: #475569; text-align: center; padding: 20px 8px; font-style: italic; }

        /* Modal */
        .modal-overlay {
            display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6);
            z-index: 200; justify-content: center; align-items: center;
            backdrop-filter: blur(4px);
        }
        .modal-overlay.show { display: flex; }
        .modal {
            background: #1e293b; border: 1px solid #334155; border-radius: 14px;
            padding: 32px; width: 420px; max-width: 90vw; max-height: 90vh; overflow-y: auto;
        }
        .modal h2 { font-size: 1.1rem; color: #f8fafc; margin-bottom: 20px; }
        .modal label { display: block; font-size: 0.78rem; color: #94a3b8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
        .modal input, .modal textarea, .modal select {
            width: 100%; padding: 10px 12px; background: #0f172a; border: 1px solid #334155;
            border-radius: 8px; color: #f8fafc; font-size: 0.88rem; margin-bottom: 14px;
            font-family: inherit;
        }
        .modal input:focus, .modal textarea:focus, .modal select:focus { outline: none; border-color: #f59e0b; }
        .modal textarea { resize: vertical; min-height: 60px; }
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
        .modal-actions button {
            padding: 10px 22px; border-radius: 8px; border: none; font-weight: 700;
            font-size: 0.85rem; cursor: pointer; transition: background .2s;
        }
        .modal-cancel { background: #334155; color: #e2e8f0; }
        .modal-cancel:hover { background: #475569; }
        .modal-save { background: #f59e0b; color: #0f172a; }
        .modal-save:hover { background: #d97706; }

        @media (max-width: 768px) {
            .board { flex-direction: column; align-items: stretch; }
            .column { width: 100%; min-width: auto; }
            .stats { flex-direction: column; }
        }
    </style>
</head>
<body>

    <div class="topbar">
        <h1><span>Pipeline</span> — Redisenos Web</h1>
        <div class="topbar-right">
            <div class="toast" id="toast">Guardado</div>
            <button class="btn-add" onclick="openModal()">+ Nuevo prospecto</button>
        </div>
    </div>

    <div class="stats" id="stats"></div>
    <div class="board" id="board"></div>

    <!-- Modal nuevo prospecto -->
    <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
            <h2 id="modalTitle">Nuevo prospecto</h2>
            <input type="hidden" id="editId">
            <label>Nombre del negocio</label>
            <input type="text" id="fNombre" placeholder="Ej: Bar Txoko">
            <label>Tipo de negocio</label>
            <input type="text" id="fTipo" placeholder="Ej: bar, peluquería, clínica...">
            <label>URL de la web</label>
            <input type="url" id="fUrl" placeholder="https://...">
            <label>Ciudad</label>
            <input type="text" id="fCiudad" value="Bilbao">
            <label>Fase</label>
            <select id="fFase">
                ${FASES.map(f => `<option value="${f.id}">${f.label}</option>`).join('')}
            </select>
            <label>Notas</label>
            <textarea id="fNotas" placeholder="Observaciones..."></textarea>
            <div class="modal-actions">
                <button class="modal-cancel" onclick="closeModal()">Cancelar</button>
                <button class="modal-save" onclick="saveNew()">Guardar</button>
            </div>
        </div>
    </div>

    <script>
    const FASES = ${JSON.stringify(FASES)};
    let proyectos = ${JSON.stringify(proyectos)};
    let dragId = null;

    function render() {
        const activos = proyectos.filter(p => !['descartado','cobrado'].includes(p.fase)).length;
        const cobrados = proyectos.filter(p => p.fase === 'cobrado').length;
        const facturado = proyectos.filter(p => p.cobrado).reduce((s,p) => s + (p.presupuesto||0), 0);

        document.getElementById('stats').innerHTML = \`
            <div class="stat"><div class="stat-label">Total</div><div class="stat-value">\${proyectos.length}</div></div>
            <div class="stat"><div class="stat-label">Activos</div><div class="stat-value amber">\${activos}</div></div>
            <div class="stat"><div class="stat-label">Cobrados</div><div class="stat-value green">\${cobrados}</div></div>
            <div class="stat"><div class="stat-label">Facturado</div><div class="stat-value green">\${facturado > 0 ? facturado + ' \\u20ac' : '\\u2014'}</div></div>
        \`;

        document.getElementById('board').innerHTML = FASES.map(fase => {
            const items = proyectos.filter(p => p.fase === fase.id);
            const cards = items.map(p => \`
                <div class="card-wrapper">
                    <button class="card-delete" onclick="eliminar('\${p.id}')" title="Eliminar">&times;</button>
                    <div class="card" draggable="true" data-id="\${p.id}"
                         ondragstart="onDragStart(event)" ondragend="onDragEnd(event)"
                         ondblclick="editCard('\${p.id}')">
                        <div class="card-header">
                            <span class="card-name">\${p.nombre}</span>
                            <span class="card-type">\${p.tipo}</span>
                        </div>
                        <div class="card-city">\${p.ciudad || ''}</div>
                        \${p.url ? '<a class="card-url" href="'+p.url+'" target="_blank" onclick="event.stopPropagation()">'+p.url.replace('https://www.','').replace('https://','')+'</a>' : ''}
                        \${p.presupuesto ? '<div class="card-price">'+p.presupuesto+' \\u20ac</div>' : ''}
                        \${p.notas ? '<div class="card-notes">'+p.notas+'</div>' : ''}
                        <div class="card-dates">
                            <span>Inicio: \${p.fechaInicio}</span>
                            <span>\\u00dalt: \${p.ultimaAccion}</span>
                        </div>
                        \${p.showcaseUrl ? '<a class="card-showcase" href="'+operator.showcaseBaseUrl+'/'+p.showcaseUrl+'" target="_blank" onclick="event.stopPropagation()">Ver showcase</a>' : ''}
                    </div>
                </div>
            \`).join('');

            return \`
                <div class="column" data-fase="\${fase.id}"
                     ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event)">
                    <div class="column-header" style="border-top-color:\${fase.color}">
                        <span class="column-title">\${fase.label}</span>
                        <span class="column-count" style="color:\${fase.color}">\${items.length}</span>
                    </div>
                    <div class="column-body">
                        \${cards || '<div class="empty">Sin proyectos</div>'}
                    </div>
                </div>
            \`;
        }).join('');
    }

    function onDragStart(e) {
        dragId = e.target.dataset.id;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }
    function onDragEnd(e) {
        e.target.classList.remove('dragging');
        document.querySelectorAll('.column').forEach(c => c.classList.remove('drag-over'));
        dragId = null;
    }
    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    }
    function onDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }
    function onDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const newFase = e.currentTarget.dataset.fase;
        if (!dragId || !newFase) return;
        const p = proyectos.find(x => x.id === dragId);
        if (p && p.fase !== newFase) {
            p.fase = newFase;
            p.ultimaAccion = new Date().toISOString().split('T')[0];
            if (newFase === 'cobrado') p.cobrado = true;
            guardar();
            render();
        }
    }

    function openModal() {
        document.getElementById('editId').value = '';
        document.getElementById('modalTitle').textContent = 'Nuevo prospecto';
        document.getElementById('fNombre').value = '';
        document.getElementById('fTipo').value = '';
        document.getElementById('fUrl').value = '';
        document.getElementById('fCiudad').value = 'Bilbao';
        document.getElementById('fFase').value = 'prospecto';
        document.getElementById('fNotas').value = '';
        document.getElementById('modalOverlay').classList.add('show');
        document.getElementById('fNombre').focus();
    }

    function editCard(id) {
        const p = proyectos.find(x => x.id === id);
        if (!p) return;
        document.getElementById('editId').value = id;
        document.getElementById('modalTitle').textContent = 'Editar: ' + p.nombre;
        document.getElementById('fNombre').value = p.nombre;
        document.getElementById('fTipo').value = p.tipo;
        document.getElementById('fUrl').value = p.url || '';
        document.getElementById('fCiudad').value = p.ciudad || 'Bilbao';
        document.getElementById('fFase').value = p.fase;
        document.getElementById('fNotas').value = p.notas || '';
        document.getElementById('modalOverlay').classList.add('show');
    }

    function closeModal() {
        document.getElementById('modalOverlay').classList.remove('show');
    }

    function saveNew() {
        const nombre = document.getElementById('fNombre').value.trim();
        if (!nombre) return;
        const editId = document.getElementById('editId').value;
        const hoy = new Date().toISOString().split('T')[0];

        if (editId) {
            const p = proyectos.find(x => x.id === editId);
            if (p) {
                p.nombre = nombre;
                p.tipo = document.getElementById('fTipo').value.trim();
                p.url = document.getElementById('fUrl').value.trim();
                p.ciudad = document.getElementById('fCiudad').value.trim();
                p.fase = document.getElementById('fFase').value;
                p.notas = document.getElementById('fNotas').value.trim();
                p.ultimaAccion = hoy;
            }
        } else {
            const id = nombre.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/-+$/,'');
            proyectos.push({
                id,
                nombre,
                tipo: document.getElementById('fTipo').value.trim(),
                url: document.getElementById('fUrl').value.trim(),
                ciudad: document.getElementById('fCiudad').value.trim(),
                fase: document.getElementById('fFase').value,
                fechaInicio: hoy,
                ultimaAccion: hoy,
                showcaseUrl: '',
                presupuesto: null,
                cobrado: false,
                notas: document.getElementById('fNotas').value.trim()
            });
        }

        closeModal();
        guardar();
        render();
    }

    function eliminar(id) {
        const p = proyectos.find(x => x.id === id);
        if (!p || !confirm('Eliminar "' + p.nombre + '"?')) return;
        proyectos = proyectos.filter(x => x.id !== id);
        guardar();
        render();
    }

    function guardar() {
        fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proyectos)
        }).then(r => {
            if (r.ok) showToast('Guardado');
            else showToast('Error al guardar');
        }).catch(() => showToast('Error de conexion'));
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 1500);
    }

    // Cerrar modal con Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });

    render();
    </script>

</body>
</html>`;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    const proyectos = loadProyectos();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildHTML(proyectos));
  } else if (req.method === 'POST' && req.url === '/api/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        saveProyectos(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"error":"' + e.message + '"}');
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Pipeline en http://localhost:${PORT}`);
  console.log('Los cambios se guardan automaticamente en projects/pipeline.json');
  console.log('Ctrl+C para cerrar');
});
