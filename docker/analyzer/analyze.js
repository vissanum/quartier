#!/usr/bin/env node

// Análisis automatizado de webs de prospectos.
// Corre DENTRO de Docker (Puppeteer + Lighthouse).
//
// Input:  /app/input/urls.json  → [{ id, url }]
// Output: /app/output/results.json + /app/output/screenshots/<id>/

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const INPUT_FILE = '/app/input/urls.json';
const OUTPUT_DIR = '/app/output';
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');

// --- Helpers ---

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function httpHead(url, timeout = 8000) {
    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            // Follow one redirect
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const next = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : new URL(res.headers.location, url).href;
                const client2 = next.startsWith('https') ? https : http;
                client2.get(next, { timeout }, (res2) => {
                    res2.resume();
                    resolve({
                        statusCode: res2.statusCode,
                        headers: res2.headers,
                        finalUrl: next,
                        redirected: true,
                    });
                }).on('error', () => resolve(null));
                res.resume();
                return;
            }
            res.resume();
            resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                finalUrl: url,
                redirected: false,
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

function fetchText(url, timeout = 8000) {
    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const next = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : new URL(res.headers.location, url).href;
                return fetchText(next, timeout).then(resolve);
            }
            if (res.statusCode !== 200) { res.resume(); return resolve(null); }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

// --- Clasificación ---

function classify(url) {
    const u = url.toLowerCase();
    // Social media links (no son webs reales)
    if (/instagram\.com|facebook\.com|twitter\.com|x\.com|tiktok\.com|linkedin\.com/.test(u)) {
        return { isRealWebsite: false, isSocialMedia: true, isBuilder: false, builderName: null, isParked: false };
    }
    // Builders gratuitos
    const builders = [
        { pattern: /ueniweb\.com/, name: 'ueniweb' },
        { pattern: /webnode\.(es|com)/, name: 'webnode' },
        { pattern: /wixsite\.com|wix\.com/, name: 'wix' },
        { pattern: /squarespace\.com/, name: 'squarespace' },
        { pattern: /wordpress\.com/, name: 'wordpress.com' },
        { pattern: /jimdo\.com/, name: 'jimdo' },
        { pattern: /weebly\.com/, name: 'weebly' },
        { pattern: /blogspot\.com/, name: 'blogger' },
        { pattern: /sites\.google\.com/, name: 'google-sites' },
        { pattern: /godaddysites\.com/, name: 'godaddy' },
        { pattern: /strikingly\.com/, name: 'strikingly' },
    ];
    for (const b of builders) {
        if (b.pattern.test(u)) {
            return { isRealWebsite: true, isSocialMedia: false, isBuilder: true, builderName: b.name, isParked: false };
        }
    }
    return { isRealWebsite: true, isSocialMedia: false, isBuilder: false, builderName: null, isParked: false };
}

// --- Extracción técnica desde HTML ---

function extractTechFromHtml(html) {
    if (!html) return {};

    // CMS detection
    let cms = null;
    let cmsVersion = null;
    let wpTheme = null;
    const wpPlugins = [];

    // WordPress
    if (/wp-content|wp-includes/i.test(html)) {
        cms = 'wordpress';
        // Version from meta generator
        const genMatch = html.match(/<meta[^>]*name=["']generator["'][^>]*content=["']WordPress\s*([\d.]+)["']/i);
        if (genMatch) cmsVersion = genMatch[1];
        // Version from ver= query strings
        if (!cmsVersion) {
            const verMatch = html.match(/[?&]ver=([\d.]+)/);
            if (verMatch) cmsVersion = verMatch[1];
        }
        // Theme
        const themeMatch = html.match(/wp-content\/themes\/([^/"']+)/i);
        if (themeMatch) wpTheme = themeMatch[1];
        // Plugins
        const pluginMatches = html.matchAll(/wp-content\/plugins\/([^/"']+)/gi);
        const pluginSet = new Set();
        for (const m of pluginMatches) pluginSet.add(m[1]);
        wpPlugins.push(...pluginSet);
    }
    // Joomla
    if (!cms && /\/media\/jui\/|com_content|Joomla!/i.test(html)) {
        cms = 'joomla';
        const jMatch = html.match(/Joomla!\s*([\d.]+)/i);
        if (jMatch) cmsVersion = jMatch[1];
    }
    // Drupal
    if (!cms && /drupal\.js|Drupal\.settings/i.test(html)) {
        cms = 'drupal';
    }
    // Prestashop
    if (!cms && /prestashop|modules\/ps_/i.test(html)) {
        cms = 'prestashop';
    }

    // Generator meta (genérico)
    const generatorMatch = html.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']+)["']/i);
    const generator = generatorMatch ? generatorMatch[1].trim() : null;

    // Frameworks / libraries
    const frameworks = [];
    if (/jquery[.\-/]|jquery\.min\.js/i.test(html)) frameworks.push('jquery');
    if (/bootstrap[.\-/]|bootstrap\.min/i.test(html)) frameworks.push('bootstrap');
    if (/react[.\-/]|reactDOM|__NEXT_DATA__/i.test(html)) frameworks.push('react');
    if (/vue[.\-/]|__VUE__/i.test(html)) frameworks.push('vue');
    if (/angular[.\-/]|ng-app/i.test(html)) frameworks.push('angular');
    if (/tailwindcss|tw-/i.test(html)) frameworks.push('tailwind');

    // CSS moderno
    const hasFlexbox = /display\s*:\s*flex/i.test(html);
    const hasGrid = /display\s*:\s*grid/i.test(html);
    const usesTablesForLayout = /<table[^>]*>(?:(?!<\/table>)[\s\S])*(?:width=|cellpadding|cellspacing|bgcolor)/i.test(html);

    // Meta tags
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || null;
    const viewport = html.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
    const description = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;

    // Analytics / tracking
    const hasGoogleAnalytics = /google-analytics|googletagmanager|gtag/i.test(html);
    const hasStructuredData = /application\/ld\+json/i.test(html);

    // Frescura
    let copyrightYear = null;
    const copyMatch = html.match(/©\s*(\d{4})|copyright\s*(\d{4})/i);
    if (copyMatch) copyrightYear = parseInt(copyMatch[1] || copyMatch[2], 10);

    // Conteos
    const imageCount = (html.match(/<img[\s>]/gi) || []).length;
    const scriptCount = (html.match(/<script[\s>]/gi) || []).length;
    const styleCount = (html.match(/<link[^>]*stylesheet/gi) || []).length + (html.match(/<style[\s>]/gi) || []).length;

    return {
        meta: { title, description, viewport, generator, ogTitle, ogImage },
        tech: {
            cms, cmsVersion, wpTheme, wpPlugins,
            frameworks, hasFlexbox, hasGrid, usesTablesForLayout,
            hasGoogleAnalytics, hasStructuredData,
        },
        freshness: { copyrightYear },
        metrics: { imageCount, scriptCount, styleCount },
    };
}

// --- Frescura: sitemap.xml ---

async function checkSitemap(baseUrl) {
    try {
        const origin = new URL(baseUrl).origin;
        const xml = await fetchText(`${origin}/sitemap.xml`, 5000);
        if (!xml || !xml.includes('<urlset')) return null;

        const dates = [];
        const matches = xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g);
        for (const m of matches) {
            const d = new Date(m[1]);
            if (!isNaN(d)) dates.push(d);
        }
        if (dates.length === 0) return null;
        dates.sort((a, b) => b - a);
        return dates[0].toISOString().split('T')[0];
    } catch {
        return null;
    }
}

// --- WordPress REST API ---

async function checkWpApi(baseUrl) {
    try {
        const origin = new URL(baseUrl).origin;
        const json = await fetchText(`${origin}/wp-json/wp/v2/posts?per_page=1&orderby=date&order=desc`, 5000);
        if (!json) return null;
        const posts = JSON.parse(json);
        if (Array.isArray(posts) && posts.length > 0 && posts[0].date) {
            return posts[0].date.split('T')[0];
        }
    } catch {
        // REST API not public or not WordPress
    }
    return null;
}

// --- Parking detection ---

function detectParking(html) {
    if (!html) return true;
    const patterns = [
        /domain\s+is\s+for\s+sale/i,
        /buy\s+this\s+domain/i,
        /parked\s+free/i,
        /sedoparking/i,
        /godaddy.*park/i,
        /hugedomains/i,
        /this\s+domain\s+has\s+expired/i,
        /domain\s+expired/i,
        /renovar\s+dominio/i,
        /dominio.*caducado/i,
        /dominio.*expirado/i,
    ];
    return patterns.some(p => p.test(html));
}

// --- Lighthouse ---

async function runLighthouse(url, port) {
    try {
        const { default: lighthouse } = await import('lighthouse');
        const result = await lighthouse(url, {
            port,
            logLevel: 'error',
            output: 'json',
            onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        });

        if (!result || !result.lhr) return null;

        const lhr = result.lhr;
        return {
            performance: Math.round((lhr.categories.performance?.score || 0) * 100),
            accessibility: Math.round((lhr.categories.accessibility?.score || 0) * 100),
            bestPractices: Math.round((lhr.categories['best-practices']?.score || 0) * 100),
            seo: Math.round((lhr.categories.seo?.score || 0) * 100),
            firstContentfulPaint: lhr.audits['first-contentful-paint']?.numericValue || null,
            largestContentfulPaint: lhr.audits['largest-contentful-paint']?.numericValue || null,
            totalBlockingTime: lhr.audits['total-blocking-time']?.numericValue || null,
            cumulativeLayoutShift: lhr.audits['cumulative-layout-shift']?.numericValue || null,
        };
    } catch (err) {
        console.error(`    Lighthouse error: ${err.message}`);
        return null;
    }
}

// --- Análisis principal de una URL ---

async function analyzeUrl(browser, id, url) {
    console.log(`\n  Analizando: ${url}`);
    const result = {
        id,
        url,
        analyzedAt: new Date().toISOString(),
        error: null,
        classification: classify(url),
        http: {},
        meta: {},
        tech: {},
        freshness: {},
        lighthouse: null,
        metrics: {},
        screenshots: {},
    };

    // Si es social media, no analizamos más
    if (result.classification.isSocialMedia) {
        console.log('    → Social media, saltando análisis');
        return result;
    }

    // 1. HTTP HEAD para headers
    console.log('    HTTP headers...');
    const head = await httpHead(url);
    if (!head) {
        result.error = 'No responde';
        result.http = { statusCode: null, isDown: true };
        result.classification.isDown = true;
        return result;
    }
    result.http = {
        statusCode: head.statusCode,
        isHttps: head.finalUrl?.startsWith('https://') || false,
        lastModified: head.headers['last-modified'] || null,
        server: head.headers['server'] || null,
        poweredBy: head.headers['x-powered-by'] || null,
        redirectedTo: head.redirected ? head.finalUrl : null,
    };

    // 2. Puppeteer: cargar página, screenshots, extraer datos
    let page;
    try {
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Desktop
        console.log('    Cargando página (desktop)...');
        await page.setViewport({ width: 1280, height: 800 });

        const startTime = Date.now();
        let response;
        try {
            response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        } catch (navErr) {
            // Retry con timeout más largo
            try {
                response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
            } catch {
                result.error = `No carga: ${navErr.message}`;
                result.classification.isDown = true;
                await page.close();
                return result;
            }
        }
        const loadTimeMs = Date.now() - startTime;

        result.http.statusCode = response?.status() || head.statusCode;
        result.metrics.loadTimeMs = loadTimeMs;

        // HTML content
        const html = await page.content();
        result.metrics.pageSizeKB = Math.round(Buffer.byteLength(html) / 1024);

        // Parking detection
        if (detectParking(html)) {
            result.classification.isParked = true;
        }

        // Technical extraction from HTML
        const techData = extractTechFromHtml(html);
        result.meta = techData.meta;
        result.tech = techData.tech;
        result.freshness = techData.freshness;
        result.metrics = { ...result.metrics, ...techData.metrics };

        // DOM metrics from browser
        console.log('    Extrayendo métricas...');
        const domMetrics = await page.evaluate(() => {
            return {
                domElements: document.querySelectorAll('*').length,
                hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
                doctype: document.doctype ? document.doctype.name : null,
            };
        });
        result.metrics.domElements = domMetrics.domElements;

        // Screenshot desktop
        const screenshotDir = path.join(SCREENSHOTS_DIR, id);
        ensureDir(screenshotDir);

        console.log('    Screenshot desktop...');
        await page.screenshot({
            path: path.join(screenshotDir, 'desktop.png'),
            fullPage: false,
        });
        result.screenshots.desktop = `screenshots/${id}/desktop.png`;

        // Screenshot mobile
        console.log('    Screenshot mobile...');
        await page.setViewport({ width: 375, height: 812 });
        await new Promise(r => setTimeout(r, 500)); // Esperar reflow
        await page.screenshot({
            path: path.join(screenshotDir, 'mobile.png'),
            fullPage: false,
        });
        result.screenshots.mobile = `screenshots/${id}/mobile.png`;

        await page.close();
    } catch (err) {
        result.error = err.message;
        if (page) try { await page.close(); } catch {}
    }

    // 3. Frescura: sitemap.xml
    console.log('    Comprobando sitemap.xml...');
    result.freshness.sitemapLastmod = await checkSitemap(url);

    // 4. WordPress REST API (solo si es WordPress)
    if (result.tech.cms === 'wordpress') {
        console.log('    Comprobando WordPress REST API...');
        result.freshness.wpLastPostDate = await checkWpApi(url);
    }

    // 5. Lighthouse
    console.log('    Lighthouse audit...');
    const browserWsEndpoint = browser.wsEndpoint();
    const port = new URL(browserWsEndpoint).port;
    result.lighthouse = await runLighthouse(url, port);

    if (result.lighthouse) {
        console.log(`    → Performance: ${result.lighthouse.performance} | SEO: ${result.lighthouse.seo} | Accesibilidad: ${result.lighthouse.accessibility}`);
    }

    return result;
}

// --- Main ---

async function main() {
    console.log('=== Prospect Analyzer ===\n');

    // Leer input
    if (!fs.existsSync(INPUT_FILE)) {
        console.error('No se encontró /app/input/urls.json');
        process.exit(1);
    }

    const urls = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
    console.log(`URLs a analizar: ${urls.length}`);

    ensureDir(OUTPUT_DIR);
    ensureDir(SCREENSHOTS_DIR);

    // Lanzar browser (usa Chromium del sistema en Docker)
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    });

    const results = [];

    for (let i = 0; i < urls.length; i++) {
        const { id, url } = urls[i];
        console.log(`\n[${i + 1}/${urls.length}] ${id}`);

        try {
            const result = await analyzeUrl(browser, id, url);
            results.push(result);
        } catch (err) {
            console.error(`  ✗ Error fatal: ${err.message}`);
            results.push({ id, url, error: err.message, analyzedAt: new Date().toISOString() });
        }
    }

    await browser.close();

    // Guardar resultados
    const outputFile = path.join(OUTPUT_DIR, 'results.json');
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

    // Resumen
    console.log('\n\n=== Resumen ===');
    console.log(`Analizados: ${results.length}`);
    console.log(`Errores: ${results.filter(r => r.error).length}`);
    console.log(`Social media: ${results.filter(r => r.classification?.isSocialMedia).length}`);
    console.log(`Builders: ${results.filter(r => r.classification?.isBuilder).length}`);
    console.log(`Parked/down: ${results.filter(r => r.classification?.isParked || r.classification?.isDown).length}`);
    console.log(`Con Lighthouse: ${results.filter(r => r.lighthouse).length}`);
    console.log(`\nResultados en: ${outputFile}`);
}

main().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
