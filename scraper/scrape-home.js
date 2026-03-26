#!/usr/bin/env node

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const [,, url, name] = process.argv;

if (!url || !name) {
  console.error('Uso: node scraper.js <url> <nombre-proyecto>');
  console.error('Ejemplo: node scraper.js https://bar-ejemplo.com bar-ejemplo');
  process.exit(1);
}

const projectDir = path.join(process.cwd(), 'projects', name, 'original');
const assetsDir = path.join(projectDir, 'assets');

function downloadFile(fileUrl, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });

    const protocol = fileUrl.startsWith('https') ? https : http;
    protocol.get(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => { stream.close(); resolve(dest); });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

function sanitizeFilename(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const filename = path.basename(parsed.pathname) || 'image';
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
  } catch {
    return 'asset_' + Math.random().toString(36).substring(2, 8);
  }
}

async function scrape() {
  console.log(`\n[1/4] Preparando directorios...`);
  fs.mkdirSync(assetsDir, { recursive: true });

  console.log(`[2/4] Abriendo ${url} con Puppeteer...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

  // Screenshot desktop
  await page.setViewport({ width: 1280, height: 800 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({
    path: path.join(projectDir, 'screenshot-desktop.png'),
    fullPage: true
  });
  console.log('   → screenshot-desktop.png');

  // Screenshot mobile
  await page.setViewport({ width: 375, height: 812 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({
    path: path.join(projectDir, 'screenshot-mobile.png'),
    fullPage: true
  });
  console.log('   → screenshot-mobile.png');

  // HTML renderizado
  const html = await page.content();
  fs.writeFileSync(path.join(projectDir, 'index.html'), html, 'utf-8');
  console.log('   → index.html');

  // Extraer CSS de hojas externas
  const stylesheets = await page.evaluate(() => {
    return Array.from(document.styleSheets).map(sheet => {
      try {
        return {
          href: sheet.href,
          rules: Array.from(sheet.cssRules || []).map(r => r.cssText).join('\n')
        };
      } catch {
        return { href: sheet.href, rules: '' };
      }
    });
  });

  const allCss = stylesheets.map(s => s.rules).filter(Boolean).join('\n\n');
  if (allCss) {
    fs.writeFileSync(path.join(projectDir, 'styles.css'), allCss, 'utf-8');
    console.log('   → styles.css (CSS extraído)');
  }

  await browser.close();

  // Descargar imágenes
  console.log(`[3/4] Descargando imágenes...`);
  const $ = cheerio.load(html);
  const imgUrls = new Set();

  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    const resolved = resolveUrl(url, src);
    if (resolved && !resolved.startsWith('data:')) imgUrls.add(resolved);
  });

  $('[style]').each((_, el) => {
    const style = $(el).attr('style');
    const matches = style.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
    if (matches) {
      matches.forEach(m => {
        const imgUrl = m.replace(/url\(['"]?/, '').replace(/['"]?\)/, '');
        const resolved = resolveUrl(url, imgUrl);
        if (resolved && !resolved.startsWith('data:')) imgUrls.add(resolved);
      });
    }
  });

  // Imágenes de background en CSS
  const cssMatches = allCss.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
  if (cssMatches) {
    cssMatches.forEach(m => {
      const imgUrl = m.replace(/url\(['"]?/, '').replace(/['"]?\)/, '');
      const resolved = resolveUrl(url, imgUrl);
      if (resolved && !resolved.startsWith('data:')) imgUrls.add(resolved);
    });
  }

  let downloaded = 0;
  const imgMap = {};
  for (const imgUrl of imgUrls) {
    const filename = sanitizeFilename(imgUrl);
    const uniqueName = `${downloaded}_${filename}`;
    const dest = path.join(assetsDir, uniqueName);
    try {
      const result = await downloadFile(imgUrl, dest);
      if (result) {
        downloaded++;
        imgMap[imgUrl] = `assets/${uniqueName}`;
        process.stdout.write(`   → ${uniqueName}\n`);
      }
    } catch {
      // skip failed downloads
    }
  }

  // Guardar mapa de imágenes
  fs.writeFileSync(
    path.join(projectDir, 'assets-map.json'),
    JSON.stringify(imgMap, null, 2),
    'utf-8'
  );

  console.log(`[4/4] Completado!`);
  console.log(`\n   Proyecto: projects/${name}/original/`);
  console.log(`   HTML: index.html`);
  console.log(`   Screenshots: desktop + mobile`);
  console.log(`   CSS: styles.css`);
  console.log(`   Imágenes: ${downloaded} descargadas`);
  console.log(`\n   Siguiente paso: analizar el contenido y crear el rediseño.\n`);
}

scrape().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
