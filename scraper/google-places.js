#!/usr/bin/env node

// Descarga valoración, reseñas y fotos de un negocio desde Google Places API (New).
// Uso: node google-places.js "<negocio>" "<localidad>" <nombre-proyecto>
// Ejemplo: node google-places.js "Oreka Fisioterapia" "Erandio" oreka-fisioterapia
//
// Requiere: variable de entorno GOOGLE_PLACES_API_KEY
// Obtener en: https://console.cloud.google.com/apis/credentials
// Habilitar: Places API (New) en https://console.cloud.google.com/apis/library

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

const [,, negocio, localidad, proyecto] = process.argv;

if (!negocio || !localidad || !proyecto) {
    console.error('Uso: node google-places.js "<negocio>" "<localidad>" <nombre-proyecto>');
    process.exit(1);
}

const PROJECTS_DIR = path.join(process.cwd(), 'projects', proyecto);
const ORIGINAL_DIR = path.join(PROJECTS_DIR, 'original');
const GOOGLE_DIR = path.join(ORIGINAL_DIR, 'assets', 'google');
const OUTPUT_FILE = path.join(ORIGINAL_DIR, 'google-places.json');

// --- HTTP helpers ---

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
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks) }));
            res.on('error', reject);
        }).on('error', reject).end();
    });
}

function httpsPost(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const payload = JSON.stringify(body);
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                ...headers,
            },
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString();
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(raw) });
                } catch {
                    resolve({ status: res.statusCode, data: raw });
                }
            });
            res.on('error', reject);
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function downloadFile(url, dest) {
    // Para fotos, la New API redirige a la imagen real
    const res = await httpsGet(url);
    if (res.status === 200 && res.data.length > 0) {
        fs.writeFileSync(dest, res.data);
        return true;
    }
    return false;
}

// --- Places API (New) ---

async function findPlace(query) {
    const fieldMask = [
        'places.id', 'places.displayName', 'places.formattedAddress',
    ].join(',');

    const res = await httpsPost(
        'https://places.googleapis.com/v1/places:searchText',
        {
            textQuery: query,
            languageCode: 'es',
            regionCode: 'ES',
            maxResultCount: 1,
        },
        {
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': fieldMask,
        }
    );

    if (res.status !== 200 || !res.data.places || res.data.places.length === 0) {
        return null;
    }

    const place = res.data.places[0];
    return {
        place_id: place.id,
        name: place.displayName?.text || null,
        formatted_address: place.formattedAddress || null,
    };
}

async function getPlaceDetails(placeId) {
    const fieldMask = [
        'displayName', 'formattedAddress',
        'nationalPhoneNumber', 'internationalPhoneNumber',
        'websiteUri', 'rating', 'userRatingCount',
        'reviews', 'photos',
        'regularOpeningHours', 'googleMapsUri',
        'types', 'businessStatus',
    ].join(',');

    const url = `https://places.googleapis.com/v1/places/${placeId}?languageCode=es`;

    const res = await httpsGet(url, {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': fieldMask,
    });

    if (res.status !== 200) {
        return null;
    }

    return JSON.parse(res.data.toString());
}

async function downloadPhoto(photoName, maxWidth, dest) {
    const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${API_KEY}`;
    return downloadFile(url, dest);
}

// --- Main ---

async function main() {
    const query = `${negocio} ${localidad}`;
    console.log(`Buscando "${query}" en Google Places...\n`);

    // 1. Buscar el negocio
    const place = await findPlace(query);
    if (!place) {
        console.error('No se encontró el negocio en Google Places.');
        console.error('Comprueba que el nombre y la localidad son correctos.');
        process.exit(1);
    }
    console.log(`Encontrado: ${place.name}`);
    console.log(`Dirección: ${place.formatted_address}`);
    console.log(`Place ID: ${place.place_id}\n`);

    // 2. Obtener detalles
    const details = await getPlaceDetails(place.place_id);
    if (!details) {
        console.error('No se pudieron obtener los detalles del negocio.');
        process.exit(1);
    }

    // 3. Mostrar resultados
    console.log(`--- Valoración ---`);
    if (details.rating) {
        console.log(`Nota: ${details.rating}/5 (${details.userRatingCount || 0} opiniones)`);
        if (details.rating >= 4.0) {
            console.log(`✓ Nota >= 4.0 → incluir como prueba social`);
        } else {
            console.log(`✗ Nota < 4.0 → no incluir`);
        }
    } else {
        console.log(`Sin valoraciones`);
    }

    console.log(`\n--- Reseñas ---`);
    const reviews = details.reviews || [];
    const goodReviews = reviews.filter(r => r.rating >= 4);
    console.log(`Total: ${reviews.length} | Buenas (4-5★): ${goodReviews.length}`);
    goodReviews.forEach((r, i) => {
        const authorName = r.authorAttribution?.displayName || 'Anónimo';
        const reviewText = r.text?.text || '';
        const preview = reviewText.length > 100 ? reviewText.substring(0, 100) + '...' : reviewText;
        console.log(`\n  ${i + 1}. ${authorName} — ${r.rating}★`);
        console.log(`     "${preview}"`);
    });

    console.log(`\n--- Fotos ---`);
    const photos = details.photos || [];
    console.log(`Disponibles: ${photos.length}`);

    // 4. Crear directorios y guardar
    fs.mkdirSync(GOOGLE_DIR, { recursive: true });

    // Descargar fotos
    let downloadedPhotos = [];
    if (photos.length > 0) {
        const maxPhotos = Math.min(photos.length, 10);
        console.log(`Descargando ${maxPhotos} fotos...`);

        for (let i = 0; i < maxPhotos; i++) {
            const photoName = photos[i].name;
            if (!photoName) continue;

            const filename = `google-photo-${i + 1}.jpg`;
            const dest = path.join(GOOGLE_DIR, filename);
            const ok = await downloadPhoto(photoName, 1200, dest);
            if (ok) {
                const size = (fs.statSync(dest).size / 1024).toFixed(0);
                console.log(`  ✓ ${filename} (${size}KB)`);
                downloadedPhotos.push({
                    filename,
                    path: `original/assets/google/${filename}`,
                    attributions: photos[i].authorAttributions?.map(a => a.displayName) || []
                });
            } else {
                console.log(`  ✗ ${filename} — error al descargar`);
            }
        }
    }

    // 5. Guardar JSON — mismo formato de salida que antes
    const hours = details.regularOpeningHours?.weekdayDescriptions || null;
    const output = {
        place_id: place.place_id,
        name: details.displayName?.text || place.name,
        address: details.formattedAddress || place.formatted_address,
        phone: details.nationalPhoneNumber || null,
        phone_international: details.internationalPhoneNumber || null,
        website: details.websiteUri || null,
        google_maps_url: details.googleMapsUri || null,
        business_status: details.businessStatus || null,
        types: details.types || [],
        rating: details.rating || null,
        total_reviews: details.userRatingCount || 0,
        opening_hours: hours,
        reviews: reviews.map(r => ({
            author: r.authorAttribution?.displayName || 'Anónimo',
            rating: r.rating,
            text: r.text?.text || '',
            time: r.relativePublishTimeDescription || null,
            language: r.originalText?.languageCode || null,
            include_in_redesign: r.rating >= 4 && (r.text?.text || '').length > 20
        })),
        photos: downloadedPhotos,
        _meta: {
            query,
            api: 'places-api-new',
            fetched_at: new Date().toISOString()
        }
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nGuardado en: ${OUTPUT_FILE}`);

    // 6. Resumen final
    console.log(`\n=== Resumen ===`);
    console.log(`Negocio: ${output.name}`);
    console.log(`Rating: ${output.rating ? output.rating + '/5' : 'sin datos'} (${output.total_reviews} opiniones)`);
    console.log(`Reseñas útiles: ${goodReviews.filter(r => (r.text?.text || '').length > 20).length}`);
    console.log(`Fotos descargadas: ${downloadedPhotos.length}`);
    if (output.phone) console.log(`Teléfono: ${output.phone}`);
    if (output.website) console.log(`Web: ${output.website}`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
