#!/usr/bin/env node

// Busca negocios locales en Google Maps y guarda los resultados en prospects.json.
// Usa Places API (New) — Text Search. Solo recopila datos, no filtra ni evalúa.
//
// Uso:
//   node prospect-search.js "Deusto, Bilbao"                    # todos los tipos
//   node prospect-search.js "peluquería" "Deusto, Bilbao"       # un tipo concreto
//   node prospect-search.js "Deusto, Bilbao" --dry-run           # preview sin gastar API
//
// Requiere: GOOGLE_PLACES_API_KEY

const fs = require('fs');
const path = require('path');
const https = require('https');
const { placesApiKey } = require('../lib/load-env');

const API_KEY = placesApiKey;

if (!API_KEY) {
    console.error('Error: missing GOOGLE_PLACES_API_KEY in .env');
    console.error('cp .env.example .env  # then edit .env');
    process.exit(1);
}

const PROSPECTS_DIR = path.join(process.cwd(), 'prospects');
const PROSPECTS_FILE = path.join(PROSPECTS_DIR, 'prospects.json');
const SEARCHES_FILE = path.join(PROSPECTS_DIR, 'searches.json');
const CONFIG_FILE = path.join(PROSPECTS_DIR, 'config.json');

// Campos Pro (5,000 free/mes). Incluye websiteUri y rating porque Claude los necesita
// para decidir qué negocios merecen la pena. Es más eficiente que hacer Details
// por separado (3 llamadas vs 63).
const FIELD_MASK = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.websiteUri',
    'places.rating',
    'places.userRatingCount',
    'places.nationalPhoneNumber',
    'places.googleMapsUri',
    'places.businessStatus',
    'places.location',
    'places.types',
].join(',');

// --- Helpers ---

function loadJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return [];
    }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function slugify(text) {
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function httpsPost(url, body, headers) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const data = Buffer.concat(chunks).toString();
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
            res.on('error', reject);
        });

        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

// --- Places API (New) ---

async function textSearch(query, pageToken) {
    const body = {
        textQuery: query,
        languageCode: 'es',
        regionCode: 'ES',
        maxResultCount: 20,
    };

    if (pageToken) {
        body.pageToken = pageToken;
    }

    const headers = {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': FIELD_MASK + ',nextPageToken',
    };

    const res = await httpsPost(
        'https://places.googleapis.com/v1/places:searchText',
        body,
        headers
    );

    if (res.status !== 200) {
        const errMsg = res.data?.error?.message || JSON.stringify(res.data);
        throw new Error(`API error (${res.status}): ${errMsg}`);
    }

    return res.data;
}

async function searchAllPages(query) {
    const allPlaces = [];
    let pageToken = null;
    let apiCalls = 0;
    let page = 1;

    while (true) {
        console.log(`  Página ${page}...`);
        const result = await textSearch(query, pageToken);
        apiCalls++;

        const places = result.places || [];
        allPlaces.push(...places);
        console.log(`  → ${places.length} resultados`);

        if (!result.nextPageToken || page >= 3) break;

        pageToken = result.nextPageToken;
        page++;
        // Esperar antes de pedir siguiente página
        await new Promise(r => setTimeout(r, 500));
    }

    return { places: allPlaces, apiCalls };
}

// --- Conversión de datos ---

function placeToProspect(place, searchQuery, zone) {
    const name = place.displayName?.text || 'Sin nombre';
    const id = slugify(name + ' ' + (zone || ''));

    return {
        id,
        placeId: place.id || null,
        name,
        types: place.types || [],
        address: place.formattedAddress || null,
        zone: zone || null,
        phone: place.nationalPhoneNumber || null,
        website: place.websiteUri || null,
        googleMapsUrl: place.googleMapsUri || null,
        rating: place.rating || null,
        totalReviews: place.userRatingCount || 0,
        businessStatus: place.businessStatus || null,
        location: place.location || null,
        category: place.websiteUri ? null : 'nueva',
        searchQuery,
        foundAt: new Date().toISOString().split('T')[0],
        fetched: false,
        claudeNotes: null,
        status: 'found',
        pipelineId: null,
    };
}

// --- Main ---

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const force = args.includes('--force');
    const filteredArgs = args.filter(a => !a.startsWith('--'));

    let businessType = null;
    let location = null;

    if (filteredArgs.length === 1) {
        location = filteredArgs[0];
    } else if (filteredArgs.length === 2) {
        businessType = filteredArgs[0];
        location = filteredArgs[1];
    } else {
        console.error('Uso:');
        console.error('  node prospect-search.js "Deusto, Bilbao"');
        console.error('  node prospect-search.js "peluquería" "Deusto, Bilbao"');
        console.error('  node prospect-search.js "Deusto, Bilbao" --dry-run');
        console.error('  node prospect-search.js "Deusto, Bilbao" --force     # repite búsquedas ya hechas');
        process.exit(1);
    }

    // Extraer zona del location (primera parte antes de la coma)
    const zone = location.split(',')[0].trim();

    // Determinar tipos a buscar
    let types;
    if (businessType) {
        types = [businessType];
    } else {
        const config = loadJSON(CONFIG_FILE);
        types = config.businessTypes || [];
        if (types.length === 0) {
            console.error('No hay tipos de negocio en prospects/config.json');
            process.exit(1);
        }
    }

    // Cargar búsquedas previas para caché
    const searches = loadJSON(SEARCHES_FILE);
    const CACHE_DAYS = 30;
    const cacheLimit = Date.now() - (CACHE_DAYS * 24 * 60 * 60 * 1000);

    // Construir set de queries ya hechas (dentro del periodo de caché)
    const cachedQueries = new Set(
        searches
            .filter(s => new Date(s.timestamp).getTime() > cacheLimit)
            .map(s => s.query)
    );

    console.log(`\nBúsqueda en: ${location}`);
    console.log(`Tipos: ${types.length}`);
    console.log(`Modo: ${dryRun ? 'DRY RUN (sin llamadas API)' : 'REAL'}`);
    if (force) console.log('Forzando: ignora caché de búsquedas previas');
    console.log('');

    if (dryRun) {
        let totalEstimated = 0;
        let skipped = 0;
        types.forEach(type => {
            const query = `${type} en ${location}`;
            if (!force && cachedQueries.has(query)) {
                console.log(`  ⏭ "${query}" (ya buscado, saltar)`);
                skipped++;
            } else {
                console.log(`  → "${query}" (1-3 llamadas API)`);
                totalEstimated += 2;
            }
        });
        console.log(`\nEstimación: ~${totalEstimated} llamadas API (free tier: 5,000/mes)`);
        if (skipped > 0) console.log(`Saltando: ${skipped} búsquedas ya hechas (caché ${CACHE_DAYS} días). Usa --force para repetirlas.`);
        console.log('Ejecuta sin --dry-run para hacer las búsquedas.');
        return;
    }

    // Cargar prospectos existentes
    const prospects = loadJSON(PROSPECTS_FILE);
    const existingPlaceIds = new Set(prospects.map(p => p.placeId).filter(Boolean));

    let totalFound = 0;
    let totalNew = 0;
    let totalApiCalls = 0;
    let totalSkipped = 0;

    for (const type of types) {
        const query = `${type} en ${location}`;

        // Comprobar caché
        if (!force && cachedQueries.has(query)) {
            console.log(`⏭ "${query}" — ya buscado, saltando`);
            totalSkipped++;
            continue;
        }

        console.log(`Buscando: "${query}"`);

        try {
            const { places, apiCalls } = await searchAllPages(query);
            totalApiCalls += apiCalls;
            totalFound += places.length;

            let newCount = 0;
            for (const place of places) {
                if (place.id && existingPlaceIds.has(place.id)) {
                    continue; // Ya lo tenemos
                }

                const prospect = placeToProspect(place, query, zone);
                prospects.push(prospect);
                if (place.id) existingPlaceIds.add(place.id);
                newCount++;
            }

            totalNew += newCount;
            console.log(`  → ${places.length} encontrados, ${newCount} nuevos\n`);

            // Registrar búsqueda
            searches.push({
                query,
                timestamp: new Date().toISOString(),
                resultsCount: places.length,
                newProspects: newCount,
            });

            // Pausa entre búsquedas
            if (types.indexOf(type) < types.length - 1) {
                await new Promise(r => setTimeout(r, 300));
            }
        } catch (err) {
            console.error(`  ✗ Error: ${err.message}\n`);
        }
    }

    // Guardar
    saveJSON(PROSPECTS_FILE, prospects);
    saveJSON(SEARCHES_FILE, searches);

    // Resumen
    console.log('=== Resumen ===');
    console.log(`Llamadas API: ${totalApiCalls}`);
    if (totalSkipped > 0) console.log(`Búsquedas saltadas (caché): ${totalSkipped}`);
    console.log(`Negocios encontrados: ${totalFound}`);
    console.log(`Nuevos añadidos: ${totalNew}`);
    console.log(`Total en prospects.json: ${prospects.length}`);

    const conWeb = prospects.filter(p => p.website).length;
    const sinWeb = prospects.filter(p => !p.website).length;
    console.log(`Con web: ${conWeb} | Sin web: ${sinWeb}`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
