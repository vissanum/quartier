#!/usr/bin/env node

// Descarga el HTML de una web y extrae info técnica básica para que Claude la analice.
// Solo recopila datos — no puntúa ni decide.
//
// Uso:
//   node prospect-fetch.js <url>                     # descarga HTML + info técnica
//   node prospect-fetch.js <url> --screenshot        # también captura desktop + mobile
//
// Los resultados se guardan en prospects/fetched/<slug>/

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const FETCHED_DIR = path.join(process.cwd(), 'prospects', 'fetched');

// --- Helpers ---

function slugify(text) {
    return text.replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
        .substring(0, 60);
}

function fetchUrl(url, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const client = url.startsWith('https') ? https : http;
        let redirects = 0;

        function doRequest(reqUrl) {
            const req = client.get(reqUrl, { timeout }, (res) => {
                // Seguir redirects (máx 5)
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    redirects++;
                    if (redirects > 5) {
                        reject(new Error('Demasiados redirects'));
                        return;
                    }
                    const nextUrl = res.headers.location.startsWith('http')
                        ? res.headers.location
                        : new URL(res.headers.location, reqUrl).href;

                    // Si redirect cambia de http a https, usar el módulo correcto
                    const nextClient = nextUrl.startsWith('https') ? https : http;
                    if (nextClient !== client) {
                        // Re-hacer request con el módulo correcto
                        const req2 = nextClient.get(nextUrl, { timeout }, handleResponse);
                        req2.on('error', reject);
                        req2.on('timeout', () => { req2.destroy(); reject(new Error('Timeout')); });
                        return;
                    }
                    doRequest(nextUrl);
                    return;
                }
                handleResponse(res);
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        }

        function handleResponse(res) {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const elapsed = Date.now() - start;
                const body = Buffer.concat(chunks);
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body.toString('utf-8'),
                    bodySize: body.length,
                    responseTimeMs: elapsed,
                    finalUrl: res.req?.res?.responseUrl || url,
                    redirects,
                });
            });
            res.on('error', reject);
        }

        doRequest(url);
    });
}

// --- Análisis técnico básico (solo extracción, sin juicios) ---

function analyzeHtml(html, url, responseData) {
    const info = {
        url,
        fetchedAt: new Date().toISOString(),
        http: {
            statusCode: responseData.statusCode,
            responseTimeMs: responseData.responseTimeMs,
            pageSizeBytes: responseData.bodySize,
            pageSizeKB: Math.round(responseData.bodySize / 1024),
            redirects: responseData.redirects,
            isHttps: url.startsWith('https://') || responseData.finalUrl?.startsWith('https://'),
            contentType: responseData.headers['content-type'] || null,
        },
        meta: {
            title: extractMeta(html, /<title[^>]*>([^<]+)<\/title>/i),
            description: extractMetaTag(html, 'description'),
            viewport: extractMetaTag(html, 'viewport'),
            generator: extractMetaTag(html, 'generator'),
            robots: extractMetaTag(html, 'robots'),
            ogTitle: extractMetaProperty(html, 'og:title'),
            ogDescription: extractMetaProperty(html, 'og:description'),
            ogImage: extractMetaProperty(html, 'og:image'),
        },
        technology: {
            hasJQuery: /jquery[.\-/]|jquery\.min\.js/i.test(html),
            hasBootstrap: /bootstrap[.\-/]|bootstrap\.min/i.test(html),
            hasReact: /react[.\-/]|reactDOM|__NEXT_DATA__/i.test(html),
            hasVue: /vue[.\-/]|__VUE__/i.test(html),
            hasAngular: /angular[.\-/]|ng-app/i.test(html),
            hasWordPress: /wp-content|wp-includes|wordpress/i.test(html),
            wordPressVersion: extractWPVersion(html),
            hasTailwind: /tailwindcss|tw-/i.test(html),
            hasFlexbox: /display\s*:\s*flex/i.test(html),
            hasGrid: /display\s*:\s*grid/i.test(html),
            hasGoogleAnalytics: /google-analytics|googletagmanager|gtag/i.test(html),
            hasStructuredData: /application\/ld\+json/i.test(html),
            hasCookieBanner: /cookie|gdpr|consent/i.test(html),
        },
        links: {
            totalLinks: (html.match(/<a\s/gi) || []).length,
            externalLinks: (html.match(/href="https?:\/\/(?!.*(?:localhost))/gi) || []).length,
            socialLinks: extractSocialLinks(html),
        },
    };

    return info;
}

function extractMeta(html, regex) {
    const match = html.match(regex);
    return match ? match[1].trim() : null;
}

function extractMetaTag(html, name) {
    const regex = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']+)["']`, 'i');
    const regex2 = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${name}["']`, 'i');
    const match = html.match(regex) || html.match(regex2);
    return match ? match[1].trim() : null;
}

function extractMetaProperty(html, prop) {
    const regex = new RegExp(`<meta\\s+property=["']${prop}["']\\s+content=["']([^"']+)["']`, 'i');
    const regex2 = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${prop}["']`, 'i');
    const match = html.match(regex) || html.match(regex2);
    return match ? match[1].trim() : null;
}

function extractWPVersion(html) {
    const match = html.match(/<meta\s+name=["']generator["']\s+content=["']WordPress\s+([\d.]+)["']/i);
    return match ? match[1] : null;
}

function extractSocialLinks(html) {
    const patterns = {
        facebook: /facebook\.com\/[^"'\s]+/i,
        instagram: /instagram\.com\/[^"'\s]+/i,
        twitter: /twitter\.com\/[^"'\s]+|x\.com\/[^"'\s]+/i,
        linkedin: /linkedin\.com\/[^"'\s]+/i,
        youtube: /youtube\.com\/[^"'\s]+/i,
        tiktok: /tiktok\.com\/[^"'\s]+/i,
    };

    const found = {};
    for (const [name, regex] of Object.entries(patterns)) {
        const match = html.match(regex);
        if (match) found[name] = match[0];
    }
    return Object.keys(found).length > 0 ? found : null;
}

// --- Screenshots con Puppeteer ---

async function takeScreenshots(url, outputDir) {
    let browser;
    try {
        const puppeteer = require('puppeteer');
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();

        // Desktop
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
        await page.screenshot({ path: path.join(outputDir, 'screenshot-desktop.png'), fullPage: false });
        console.log('  ✓ Screenshot desktop');

        // Mobile
        await page.setViewport({ width: 375, height: 812 });
        await page.screenshot({ path: path.join(outputDir, 'screenshot-mobile.png'), fullPage: false });
        console.log('  ✓ Screenshot mobile');
    } catch (err) {
        console.error(`  ✗ Screenshots: ${err.message}`);
    } finally {
        if (browser) await browser.close();
    }
}

// --- Main ---

async function main() {
    const args = process.argv.slice(2);
    const wantScreenshot = args.includes('--screenshot');
    const url = args.find(a => !a.startsWith('--'));

    if (!url) {
        console.error('Uso:');
        console.error('  node prospect-fetch.js <url>');
        console.error('  node prospect-fetch.js <url> --screenshot');
        process.exit(1);
    }

    // Normalizar URL
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const slug = slugify(normalizedUrl);
    const outputDir = path.join(FETCHED_DIR, slug);
    fs.mkdirSync(outputDir, { recursive: true });

    console.log(`Descargando: ${normalizedUrl}`);
    console.log(`Guardando en: prospects/fetched/${slug}/\n`);

    let response;
    try {
        response = await fetchUrl(normalizedUrl);
    } catch (err) {
        const errorInfo = {
            url: normalizedUrl,
            fetchedAt: new Date().toISOString(),
            error: err.message,
            http: { statusCode: null, responseTimeMs: null },
        };
        fs.writeFileSync(path.join(outputDir, 'info.json'), JSON.stringify(errorInfo, null, 2));
        console.error(`✗ Error: ${err.message}`);
        console.log(`Info guardada en prospects/fetched/${slug}/info.json`);
        process.exit(1);
    }

    console.log(`Status: ${response.statusCode}`);
    console.log(`Tiempo: ${response.responseTimeMs}ms`);
    console.log(`Tamaño: ${Math.round(response.bodySize / 1024)}KB`);
    console.log(`Redirects: ${response.redirects}`);

    // Guardar HTML
    fs.writeFileSync(path.join(outputDir, 'index.html'), response.body);
    console.log('✓ HTML guardado');

    // Analizar
    const info = analyzeHtml(response.body, normalizedUrl, response);
    fs.writeFileSync(path.join(outputDir, 'info.json'), JSON.stringify(info, null, 2));
    console.log('✓ Info técnica guardada');

    // Resumen
    console.log('\n--- Info técnica ---');
    console.log(`Título: ${info.meta.title || '(sin título)'}`);
    console.log(`HTTPS: ${info.http.isHttps ? 'sí' : 'NO'}`);
    console.log(`Viewport: ${info.meta.viewport ? 'sí' : 'NO'}`);
    console.log(`Generator: ${info.meta.generator || '(no declarado)'}`);
    if (info.technology.wordPressVersion) {
        console.log(`WordPress: ${info.technology.wordPressVersion}`);
    }
    console.log(`jQuery: ${info.technology.hasJQuery ? 'sí' : 'no'}`);
    console.log(`Flexbox/Grid: ${info.technology.hasFlexbox || info.technology.hasGrid ? 'sí' : 'no'}`);
    console.log(`Google Analytics: ${info.technology.hasGoogleAnalytics ? 'sí' : 'no'}`);
    console.log(`Datos estructurados: ${info.technology.hasStructuredData ? 'sí' : 'no'}`);
    console.log(`Open Graph: ${info.meta.ogTitle ? 'sí' : 'no'}`);
    if (info.links.socialLinks) {
        console.log(`Redes sociales: ${Object.keys(info.links.socialLinks).join(', ')}`);
    }

    // Screenshots
    if (wantScreenshot) {
        console.log('\nCapturando screenshots...');
        await takeScreenshots(normalizedUrl, outputDir);
    }

    console.log(`\nTodo guardado en: prospects/fetched/${slug}/`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
