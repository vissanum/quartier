#!/usr/bin/env node

// UI web local para visualizar prospectos acumulados.
// Solo lectura y consulta — la interacción real es por chat con Claude.
//
// Uso: node serve-prospects.js
// Abre: http://localhost:3457

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3457;
const PROSPECTS_FILE = path.join(process.cwd(), 'prospects', 'prospects.json');
const SEARCHES_FILE = path.join(process.cwd(), 'prospects', 'searches.json');

function loadJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return [];
    }
}

function saveProspects(data) {
    fs.writeFileSync(PROSPECTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function buildHTML(prospects, searches) {
    const total = prospects.length;
    const conWeb = prospects.filter(p => p.website).length;
    const sinWeb = prospects.filter(p => !p.website).length;
    const pending = prospects.filter(p => p.status === 'found' || p.status === 'pending').length;
    const approved = prospects.filter(p => p.status === 'approved' || p.status === 'in-pipeline').length;
    const rejected = prospects.filter(p => p.status === 'rejected').length;

    const zones = [...new Set(prospects.map(p => p.zone).filter(Boolean))].sort();
    const types = [...new Set(prospects.flatMap(p => p.types || []))].sort();

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prospectos — Rediseños Web</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: #0f172a; color: #e2e8f0; min-height: 100vh;
        }

        .topbar {
            background: #1e293b; border-bottom: 1px solid #334155;
            padding: 20px 28px; display: flex; align-items: center; justify-content: space-between;
            flex-wrap: wrap; gap: 16px; position: sticky; top: 0; z-index: 100;
        }
        .topbar h1 { font-size: 1.25rem; font-weight: 700; color: #f8fafc; }
        .topbar h1 span { color: #f59e0b; }

        .stats {
            display: flex; gap: 12px; padding: 20px 28px; flex-wrap: wrap;
        }
        .stat {
            background: #1e293b; border: 1px solid #334155; border-radius: 10px;
            padding: 16px 22px; min-width: 120px; flex: 1;
        }
        .stat-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 4px; }
        .stat-value { font-size: 1.5rem; font-weight: 700; color: #f8fafc; }
        .stat-value.green { color: #34d399; }
        .stat-value.amber { color: #fbbf24; }
        .stat-value.red { color: #f87171; }
        .stat-value.blue { color: #60a5fa; }

        .layout {
            display: flex; gap: 0; min-height: calc(100vh - 180px);
        }

        .sidebar {
            width: 260px; min-width: 260px; background: #1e293b;
            border-right: 1px solid #334155; padding: 20px;
            overflow-y: auto; max-height: calc(100vh - 180px);
            position: sticky; top: 80px;
        }
        .sidebar h3 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 10px; }
        .sidebar select, .sidebar input {
            width: 100%; padding: 8px 10px; background: #0f172a; border: 1px solid #334155;
            border-radius: 6px; color: #f8fafc; font-size: 0.82rem; margin-bottom: 14px;
        }
        .sidebar select:focus, .sidebar input:focus { outline: none; border-color: #f59e0b; }

        .search-log { margin-top: 20px; }
        .search-item {
            font-size: 0.73rem; color: #64748b; padding: 6px 0;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .search-item strong { color: #94a3b8; }

        .main {
            flex: 1; padding: 20px 28px; overflow-y: auto;
        }
        .results-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 16px;
        }
        .results-count { font-size: 0.85rem; color: #94a3b8; }
        .sort-select {
            padding: 6px 10px; background: #1e293b; border: 1px solid #334155;
            border-radius: 6px; color: #f8fafc; font-size: 0.8rem;
        }

        .cards { display: flex; flex-direction: column; gap: 10px; }

        .card {
            background: #1e293b; border: 1px solid #334155; border-radius: 10px;
            padding: 18px; transition: border-color .2s;
        }
        .card:hover { border-color: #475569; }
        .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
        .card-name { font-size: 1rem; font-weight: 700; color: #f8fafc; }
        .card-rating {
            font-size: 0.78rem; padding: 3px 10px; border-radius: 6px;
            background: rgba(251,191,36,0.1); color: #fbbf24; font-weight: 700;
            white-space: nowrap;
        }
        .card-rating.no-rating { background: rgba(100,116,139,0.1); color: #64748b; }
        .card-meta { font-size: 0.78rem; color: #94a3b8; margin-bottom: 6px; }
        .card-address { font-size: 0.78rem; color: #64748b; margin-bottom: 6px; }
        .card-web {
            font-size: 0.78rem; color: #60a5fa; text-decoration: none;
            display: inline-block; margin-bottom: 6px; word-break: break-all;
        }
        .card-web:hover { text-decoration: underline; }
        .card-no-web {
            font-size: 0.78rem; color: #f59e0b; font-weight: 600;
            display: inline-block; margin-bottom: 6px;
        }
        .card-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
        .card-status {
            font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; font-weight: 600;
        }
        .status-found { background: rgba(100,116,139,0.15); color: #94a3b8; }
        .status-pending { background: rgba(251,191,36,0.15); color: #fbbf24; }
        .status-approved { background: rgba(52,211,153,0.15); color: #34d399; }
        .status-rejected { background: rgba(248,113,113,0.15); color: #f87171; }
        .status-in-pipeline { background: rgba(96,165,250,0.15); color: #60a5fa; }
        .card-date { font-size: 0.68rem; color: #475569; }
        .card-notes { font-size: 0.75rem; color: #cbd5e1; margin-top: 8px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 6px; line-height: 1.5; }
        .card-types { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
        .card-type {
            font-size: 0.62rem; padding: 1px 6px; border-radius: 3px;
            background: #334155; color: #94a3b8; text-transform: lowercase;
        }
        .card-gmaps {
            font-size: 0.73rem; color: #94a3b8; text-decoration: none;
            margin-left: 12px;
        }
        .card-gmaps:hover { color: #60a5fa; text-decoration: underline; }

        .empty-state {
            text-align: center; padding: 60px 20px; color: #475569;
        }
        .empty-state h2 { font-size: 1.1rem; color: #64748b; margin-bottom: 8px; }
        .empty-state p { font-size: 0.85rem; }

        @media (max-width: 768px) {
            .layout { flex-direction: column; }
            .sidebar { width: 100%; min-width: auto; position: static; max-height: none; }
            .stats { flex-direction: column; }
        }
    </style>
</head>
<body>

    <div class="topbar">
        <h1><span>Prospectos</span> — Rediseños Web</h1>
    </div>

    <div class="stats">
        <div class="stat"><div class="stat-label">Total</div><div class="stat-value">${total}</div></div>
        <div class="stat"><div class="stat-label">Con web</div><div class="stat-value blue">${conWeb}</div></div>
        <div class="stat"><div class="stat-label">Sin web</div><div class="stat-value amber">${sinWeb}</div></div>
        <div class="stat"><div class="stat-label">Pendientes</div><div class="stat-value">${pending}</div></div>
        <div class="stat"><div class="stat-label">Aprobados</div><div class="stat-value green">${approved}</div></div>
        <div class="stat"><div class="stat-label">Rechazados</div><div class="stat-value red">${rejected}</div></div>
    </div>

    <div class="layout">
        <div class="sidebar">
            <h3>Filtros</h3>

            <label style="font-size:0.72rem;color:#64748b;margin-bottom:4px;display:block;">Buscar nombre</label>
            <input type="text" id="filterName" placeholder="Nombre...">

            <label style="font-size:0.72rem;color:#64748b;margin-bottom:4px;display:block;">Zona</label>
            <select id="filterZone">
                <option value="">Todas</option>
                ${zones.map(z => `<option value="${z}">${z}</option>`).join('')}
            </select>

            <label style="font-size:0.72rem;color:#64748b;margin-bottom:4px;display:block;">Estado</label>
            <select id="filterStatus">
                <option value="">Todos</option>
                <option value="found">Encontrado</option>
                <option value="pending">Pendiente</option>
                <option value="approved">Aprobado</option>
                <option value="rejected">Rechazado</option>
                <option value="in-pipeline">En pipeline</option>
            </select>

            <label style="font-size:0.72rem;color:#64748b;margin-bottom:4px;display:block;">Web</label>
            <select id="filterWeb">
                <option value="">Todos</option>
                <option value="yes">Con web</option>
                <option value="no">Sin web</option>
            </select>

            <div class="search-log">
                <h3>Búsquedas recientes</h3>
                ${searches.slice(-10).reverse().map(s => `
                    <div class="search-item">
                        <strong>${s.query}</strong><br>
                        ${s.resultsCount} resultados · ${s.newProspects} nuevos<br>
                        ${new Date(s.timestamp).toLocaleDateString('es')}
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="main">
            <div class="results-header">
                <span class="results-count" id="resultsCount"></span>
                <select class="sort-select" id="sortBy">
                    <option value="date-desc">Más recientes</option>
                    <option value="date-asc">Más antiguos</option>
                    <option value="rating-desc">Mejor valorados</option>
                    <option value="rating-asc">Peor valorados</option>
                    <option value="reviews-desc">Más reseñas</option>
                    <option value="name-asc">Nombre A-Z</option>
                </select>
            </div>
            <div class="cards" id="cards"></div>
        </div>
    </div>

    <script>
    const prospects = ${JSON.stringify(prospects)};

    function render() {
        let filtered = [...prospects];

        const nameFilter = document.getElementById('filterName').value.toLowerCase();
        const zoneFilter = document.getElementById('filterZone').value;
        const statusFilter = document.getElementById('filterStatus').value;
        const webFilter = document.getElementById('filterWeb').value;
        const sortBy = document.getElementById('sortBy').value;

        if (nameFilter) filtered = filtered.filter(p => p.name.toLowerCase().includes(nameFilter));
        if (zoneFilter) filtered = filtered.filter(p => p.zone === zoneFilter);
        if (statusFilter) filtered = filtered.filter(p => p.status === statusFilter);
        if (webFilter === 'yes') filtered = filtered.filter(p => p.website);
        if (webFilter === 'no') filtered = filtered.filter(p => !p.website);

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'date-desc': return (b.foundAt || '').localeCompare(a.foundAt || '');
                case 'date-asc': return (a.foundAt || '').localeCompare(b.foundAt || '');
                case 'rating-desc': return (b.rating || 0) - (a.rating || 0);
                case 'rating-asc': return (a.rating || 0) - (b.rating || 0);
                case 'reviews-desc': return (b.totalReviews || 0) - (a.totalReviews || 0);
                case 'name-asc': return a.name.localeCompare(b.name);
                default: return 0;
            }
        });

        document.getElementById('resultsCount').textContent = filtered.length + ' de ' + prospects.length + ' prospectos';

        if (filtered.length === 0) {
            document.getElementById('cards').innerHTML = '<div class="empty-state"><h2>Sin resultados</h2><p>Ejecuta prospect-search.js para buscar negocios</p></div>';
            return;
        }

        document.getElementById('cards').innerHTML = filtered.map(p => {
            const ratingClass = p.rating ? '' : ' no-rating';
            const ratingText = p.rating ? p.rating.toFixed(1) + '\\u2605 (' + p.totalReviews + ')' : 'Sin rating';
            const statusClass = 'status-' + (p.status || 'found');
            const statusLabel = { found: 'Encontrado', pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', 'in-pipeline': 'En pipeline' }[p.status] || p.status;
            const webUrl = p.website ? p.website.replace('https://www.','').replace('https://','').replace('http://','').replace(/\\/$/, '') : null;

            const typesToShow = (p.types || []).filter(t => !['point_of_interest','establishment'].includes(t)).slice(0, 4);

            return \`
                <div class="card">
                    <div class="card-top">
                        <div>
                            <div class="card-name">\${p.name}</div>
                            <div class="card-types">
                                \${typesToShow.map(t => '<span class="card-type">' + t.replace(/_/g, ' ') + '</span>').join('')}
                            </div>
                        </div>
                        <div class="card-rating\${ratingClass}">\${ratingText}</div>
                    </div>
                    <div class="card-meta">\${p.zone || ''}\${p.phone ? ' · ' + p.phone : ''}</div>
                    <div class="card-address">\${p.address || ''}</div>
                    \${p.website
                        ? '<a class="card-web" href="' + p.website + '" target="_blank">' + webUrl + '</a>'
                        : '<span class="card-no-web">Sin web</span>'
                    }
                    \${p.googleMapsUrl ? '<a class="card-gmaps" href="' + p.googleMapsUrl + '" target="_blank">Google Maps</a>' : ''}
                    \${p.claudeNotes ? '<div class="card-notes">' + p.claudeNotes + '</div>' : ''}
                    <div class="card-bottom">
                        <span class="card-status \${statusClass}">\${statusLabel}</span>
                        <span class="card-date">\${p.foundAt || ''}</span>
                    </div>
                </div>
            \`;
        }).join('');
    }

    document.getElementById('filterName').addEventListener('input', render);
    document.getElementById('filterZone').addEventListener('change', render);
    document.getElementById('filterStatus').addEventListener('change', render);
    document.getElementById('filterWeb').addEventListener('change', render);
    document.getElementById('sortBy').addEventListener('change', render);

    render();
    </script>

</body>
</html>`;
}

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        const prospects = loadJSON(PROSPECTS_FILE);
        const searches = loadJSON(SEARCHES_FILE);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildHTML(prospects, searches));
    } else if (req.method === 'GET' && req.url === '/api/prospects') {
        const prospects = loadJSON(PROSPECTS_FILE);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(prospects));
    } else if (req.method === 'POST' && req.url === '/api/save') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                saveProspects(data);
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
    console.log(`Prospectos en http://localhost:${PORT}`);
    console.log('Ctrl+C para cerrar');
});
