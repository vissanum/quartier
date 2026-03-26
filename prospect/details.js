#!/usr/bin/env node

// Enriquece prospectos con datos Pro de Place Details (website, rating, teléfono).
// SKU Pro: 5,000 free/mes. Usar solo para los que Claude considere interesantes.
//
// Uso:
//   node prospect-details.js <placeId>              # enriquece uno
//   node prospect-details.js --pending              # enriquece todos los que no tengan datos Pro
//   node prospect-details.js --pending --limit 20   # máximo 20
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

const PROSPECTS_FILE = path.join(process.cwd(), 'prospects', 'prospects.json');

// Solo campos Pro (no Enterprise). Reviews y photos se piden en google-places.js.
const FIELD_MASK = [
    'displayName',
    'formattedAddress',
    'websiteUri',
    'rating',
    'userRatingCount',
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'googleMapsUri',
    'businessStatus',
].join(',');

function loadJSON(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function httpsGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers,
        };
        https.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString() }));
            res.on('error', reject);
        }).on('error', reject).end();
    });
}

async function getDetails(placeId) {
    const url = `https://places.googleapis.com/v1/places/${placeId}?languageCode=es`;
    const res = await httpsGet(url, {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
    });

    if (res.status !== 200) {
        const err = JSON.parse(res.data)?.error?.message || res.data;
        throw new Error(`API ${res.status}: ${err}`);
    }

    return JSON.parse(res.data);
}

async function main() {
    const args = process.argv.slice(2);
    const pending = args.includes('--pending');
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
    const singleId = args.find(a => !a.startsWith('--') && a !== args[limitIdx + 1]);

    const prospects = loadJSON(PROSPECTS_FILE);

    let targets;
    if (singleId) {
        targets = prospects.filter(p => p.placeId === singleId || p.id === singleId);
        if (targets.length === 0) {
            console.error(`No se encontró prospecto con id/placeId "${singleId}"`);
            process.exit(1);
        }
    } else if (pending) {
        // Prospectos que no tienen website ni rating (no enriquecidos aún)
        targets = prospects.filter(p => p.placeId && p.rating === null && p.status === 'found');
        if (limit < targets.length) targets = targets.slice(0, limit);
    } else {
        console.error('Uso:');
        console.error('  node prospect-details.js <placeId o id>');
        console.error('  node prospect-details.js --pending');
        console.error('  node prospect-details.js --pending --limit 20');
        process.exit(1);
    }

    console.log(`Enriqueciendo ${targets.length} prospectos (Place Details Pro)...\n`);
    let apiCalls = 0;
    let enriched = 0;

    for (const prospect of targets) {
        try {
            const details = await getDetails(prospect.placeId);
            apiCalls++;

            prospect.website = details.websiteUri || null;
            prospect.rating = details.rating || null;
            prospect.totalReviews = details.userRatingCount || 0;
            prospect.phone = details.internationalPhoneNumber || details.nationalPhoneNumber || null;

            // Categoría inicial basada en si tiene web
            if (!prospect.category) {
                prospect.category = prospect.website ? null : 'nueva';
            }

            enriched++;
            const web = prospect.website
                ? prospect.website.replace('https://www.', '').replace('https://', '').replace('http://', '').replace(/\/$/, '')
                : 'SIN WEB';
            const rating = prospect.rating ? `${prospect.rating}★` : 'sin rating';
            console.log(`  ✓ ${prospect.name} — ${web} — ${rating} (${prospect.totalReviews})`);

            // Rate limit
            if (targets.indexOf(prospect) < targets.length - 1) {
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (err) {
            console.error(`  ✗ ${prospect.name}: ${err.message}`);
        }
    }

    saveJSON(PROSPECTS_FILE, prospects);

    console.log(`\n=== Resumen ===`);
    console.log(`Llamadas API (Pro): ${apiCalls}`);
    console.log(`Enriquecidos: ${enriched}/${targets.length}`);

    const conWeb = prospects.filter(p => p.website).length;
    const sinWeb = prospects.filter(p => p.website === null && p.rating !== null).length;
    const sinDatos = prospects.filter(p => p.rating === null).length;
    console.log(`Con web: ${conWeb} | Sin web: ${sinWeb} | Sin datos Pro: ${sinDatos}`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
