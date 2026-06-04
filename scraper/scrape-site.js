#!/usr/bin/env node

/**
 * Descarga un sitio web completo: todas las subpáginas internas.
 * Uso: node scrape-site.js <url> <nombre-proyecto>
 *
 * Guarda cada subpágina como HTML + extrae el texto principal.
 * Genera un sitemap.json con la estructura del sitio.
 */

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { extractEmails } = require('../lib/emails');

const [,, baseUrl, name] = process.argv;

if (!baseUrl || !name) {
  console.error('Uso: node scrape-site.js <url> <nombre-proyecto>');
  console.error('Ejemplo: node scrape-site.js https://www.ejemplo.com mi-proyecto');
  process.exit(1);
}

const projectDir = path.join(process.cwd(), 'projects', name, 'original');
const pagesDir = path.join(projectDir, 'pages');
const assetsDir = path.join(projectDir, 'assets');

const origin = new URL(baseUrl).origin;

function downloadFile(fileUrl, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const protocol = fileUrl.startsWith('https') ? https : http;
    protocol.get(fileUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => { stream.close(); resolve(dest); });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

function resolveUrl(base, relative) {
  try { return new URL(relative, base).href; } catch { return null; }
}

function slugFromUrl(pageUrl) {
  const pathname = new URL(pageUrl).pathname;
  return pathname.replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'index';
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

async function scrapePage(page, pageUrl) {
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  } catch (e) {
    console.log(`   ⚠ Timeout en ${pageUrl}, continuando con lo cargado...`);
  }

  await new Promise(r => setTimeout(r, 500));

  const html = await page.content();
  const $ = cheerio.load(html);

  // Extraer texto principal (contenido, no nav/footer/sidebar)
  // Eliminar elementos no deseados
  $('nav, header, footer, script, style, noscript, .elementor-location-header, .elementor-location-footer').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const h1 = $('h1').first().text().trim();

  // Extraer todos los headings y párrafos del contenido principal
  const headings = [];
  $('h1, h2, h3, h4').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 2) {
      headings.push({ tag: el.tagName.toLowerCase(), text });
    }
  });

  const paragraphs = [];
  $('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 20) {
      paragraphs.push(text);
    }
  });

  // Extraer listas
  const lists = [];
  $('ul, ol').each((_, el) => {
    const items = [];
    $(el).find('li').each((_, li) => {
      const text = $(li).text().trim();
      if (text && text.length > 3) items.push(text);
    });
    if (items.length > 0) lists.push(items);
  });

  // Extraer imágenes con sus contextos
  const images = [];
  const fullHtml = await page.content();
  const $full = cheerio.load(fullHtml);
  $full('img[src]').each((_, el) => {
    const src = $full(el).attr('src') || '';
    const alt = $full(el).attr('alt') || '';
    if (src && !src.startsWith('data:') && !src.includes('logo-icon')) {
      const resolved = resolveUrl(pageUrl, src);
      if (resolved) images.push({ src: resolved, alt });
    }
  });

  // Extraer links internos
  const internalLinks = new Set();
  $full('a[href]').each((_, el) => {
    const href = $full(el).attr('href');
    const resolved = resolveUrl(pageUrl, href);
    if (resolved && resolved.startsWith(origin) && !resolved.includes('#')
        && !resolved.includes('/wp-content/') && !resolved.includes('/wp-json/')
        && !resolved.includes('/wp-admin/') && !resolved.includes('?')) {
      const cleanUrl = resolved.replace(/\/$/, '');
      const hasFileExt = /\.[a-zA-Z0-9]+$/.test(cleanUrl);
      internalLinks.add(hasFileExt ? cleanUrl : cleanUrl + '/');
    }
  });

  return {
    url: pageUrl,
    slug: slugFromUrl(pageUrl),
    title,
    metaDescription: metaDesc,
    h1,
    headings,
    paragraphs,
    lists,
    images,
    internalLinks: [...internalLinks],
    html: fullHtml
  };
}

async function scrapeFullSite() {
  console.log(`\n═══ Descargando sitio completo: ${baseUrl} ═══\n`);

  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  // Paso 1: Descubrir todas las páginas desde la home
  console.log('[1/4] Descubriendo páginas del sitio...');
  const homeData = await scrapePage(page, baseUrl);

  const discovered = new Set([baseUrl.replace(/\/$/, '') + '/']);
  const toVisit = [...homeData.internalLinks].filter(u => !discovered.has(u));
  toVisit.forEach(u => discovered.add(u));

  // Filtrar páginas que no interesan
  const skipPatterns = ['/feed/', '/author/', '/tag/', '/category/', '/page/', '/cart/', '/checkout/', '/my-account/'];

  const allPages = [homeData];
  let visited = 1;

  console.log(`   Home encontrada. ${toVisit.length} enlaces internos descubiertos.`);

  // Paso 2: Visitar todas las subpáginas
  console.log('\n[2/4] Descargando subpáginas...');

  while (toVisit.length > 0) {
    const currentUrl = toVisit.shift();

    if (skipPatterns.some(p => currentUrl.includes(p))) continue;

    visited++;
    const slug = slugFromUrl(currentUrl);
    process.stdout.write(`   [${visited}] ${slug}...`);

    try {
      const pageData = await scrapePage(page, currentUrl);
      allPages.push(pageData);

      // Guardar HTML de la subpágina
      fs.writeFileSync(path.join(pagesDir, `${slug}.html`), pageData.html, 'utf-8');

      // Descubrir nuevos enlaces
      let newLinks = 0;
      for (const link of pageData.internalLinks) {
        if (!discovered.has(link) && !skipPatterns.some(p => link.includes(p))) {
          discovered.add(link);
          toVisit.push(link);
          newLinks++;
        }
      }

      console.log(` ✓ (${pageData.paragraphs.length} párrafos${newLinks > 0 ? `, +${newLinks} nuevos enlaces` : ''})`);
    } catch (err) {
      console.log(` ✗ Error: ${err.message}`);
    }
  }

  // Screenshot de la home (desktop + mobile)
  console.log('\n[3/4] Capturando screenshots de la home...');
  await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.setViewport({ width: 1280, height: 800 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(projectDir, 'screenshot-desktop.png'), fullPage: true });
  console.log('   → screenshot-desktop.png');

  await page.setViewport({ width: 375, height: 812 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(projectDir, 'screenshot-mobile.png'), fullPage: true });
  console.log('   → screenshot-mobile.png');

  await browser.close();

  // Paso 3: Descargar todas las imágenes únicas del sitio
  console.log('\n[4/4] Descargando imágenes del sitio...');
  const allImageUrls = new Set();
  for (const pg of allPages) {
    for (const img of pg.images) {
      allImageUrls.add(img.src);
    }
  }

  let imgCount = 0;
  const imgMap = {};
  for (const imgUrl of allImageUrls) {
    const filename = sanitizeFilename(imgUrl);
    const uniqueName = `${imgCount}_${filename}`;
    const dest = path.join(assetsDir, uniqueName);
    try {
      const result = await downloadFile(imgUrl, dest);
      if (result) {
        imgMap[imgUrl] = `assets/${uniqueName}`;
        imgCount++;
        if (imgCount % 10 === 0) process.stdout.write(`   ${imgCount} imágenes...\n`);
      }
    } catch { /* skip */ }
  }
  console.log(`   → ${imgCount} imágenes descargadas`);

  // Guardar mapa de imágenes
  fs.writeFileSync(path.join(projectDir, 'assets-map.json'), JSON.stringify(imgMap, null, 2), 'utf-8');

  // Guardar HTML de la home
  fs.writeFileSync(path.join(projectDir, 'index.html'), homeData.html, 'utf-8');

  // Paso 5: Extraer branding (logo, favicon, colores, redes sociales) de la home
  console.log('\n── Extrayendo branding ──');
  const homeHtml = homeData.html;
  const $home = cheerio.load(homeHtml);

  // Logo: buscar imágenes con "logo" en src, alt, class o id
  const logos = [];
  $home('img').each((_, el) => {
    const src = $home(el).attr('src') || '';
    const alt = $home(el).attr('alt') || '';
    const cls = $home(el).attr('class') || '';
    const id = $home(el).attr('id') || '';
    const combined = `${src} ${alt} ${cls} ${id}`.toLowerCase();
    if (combined.includes('logo') || combined.includes('brand')) {
      const resolved = resolveUrl(baseUrl, src);
      if (resolved) logos.push({ src: resolved, localPath: imgMap[resolved] || null, alt });
    }
  });
  // Also check for CSS background logos in header
  $home('header, .site-header, .nav, [class*="header"], [class*="logo"]').each((_, el) => {
    const style = $home(el).attr('style') || '';
    const urlMatch = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    if (urlMatch) {
      const resolved = resolveUrl(baseUrl, urlMatch[1]);
      if (resolved) logos.push({ src: resolved, localPath: imgMap[resolved] || null, alt: 'background-logo' });
    }
  });
  console.log(`   Logos encontrados: ${logos.length}`);

  // Favicon
  let favicon = null;
  $home('link[rel*="icon"]').each((_, el) => {
    const href = $home(el).attr('href');
    if (href) {
      const resolved = resolveUrl(baseUrl, href);
      if (resolved) favicon = { src: resolved, localPath: imgMap[resolved] || null };
    }
  });
  console.log(`   Favicon: ${favicon ? 'sí' : 'no encontrado'}`);

  // Redes sociales
  const socialPatterns = {
    facebook: /facebook\.com/i,
    instagram: /instagram\.com/i,
    twitter: /twitter\.com|x\.com/i,
    linkedin: /linkedin\.com/i,
    youtube: /youtube\.com|youtu\.be/i,
    tiktok: /tiktok\.com/i,
    pinterest: /pinterest\.com/i,
    whatsapp: /wa\.me|whatsapp/i,
    telegram: /t\.me|telegram/i,
    google_maps: /google\.(com|es)\/maps|maps\.google|goo\.gl\/maps/i,
    foursquare: /foursquare\.com/i,
    yelp: /yelp\.(com|es)/i,
    tripadvisor: /tripadvisor\.(com|es)/i,
    qdq: /qdq\.com/i,
    paginasamarillas: /paginasamarillas\.es/i,
    google_business: /business\.google|g\.page/i,
    spotify: /spotify\.com/i,
    vimeo: /vimeo\.com/i,
    threads: /threads\.net/i
  };
  const socialLinks = {};
  $home('a[href]').each((_, el) => {
    const href = $home(el).attr('href') || '';
    for (const [network, pattern] of Object.entries(socialPatterns)) {
      if (pattern.test(href) && !socialLinks[network]) {
        socialLinks[network] = href;
      }
    }
  });
  console.log(`   Redes sociales: ${Object.keys(socialLinks).join(', ') || 'ninguna'}`);

  // Contact emails: scan the home plus any contact/legal subpage
  let emailHtml = homeHtml;
  for (const pg of allPages) {
    if (/contact|aviso|legal/i.test(pg.slug)) {
      const pageFile = path.join(pagesDir, `${pg.slug}.html`);
      if (fs.existsSync(pageFile)) emailHtml += '\n' + fs.readFileSync(pageFile, 'utf-8');
    }
  }
  const emails = extractEmails(emailHtml, baseUrl);
  console.log(`   Emails: ${emails.join(', ') || 'ninguno'}`);

  // Fill the project config's email if it exists and is still empty —
  // never overwrite a hand-curated value
  const configPath = path.join(process.cwd(), 'projects', name, 'config.json');
  if (emails.length && fs.existsSync(configPath)) {
    const projectConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!projectConfig.email) {
      projectConfig.email = emails[0];
      fs.writeFileSync(configPath, JSON.stringify(projectConfig, null, 2) + '\n', 'utf-8');
      console.log(`   → config.json email: ${emails[0]}`);
    }
  }

  // Colores CSS: extraer de las hojas de estilo de la home
  const colors = { backgrounds: [], texts: [], accents: [] };
  // Read styles.css if it exists
  const stylesPath = path.join(projectDir, 'styles.css');
  let cssContent = '';
  if (fs.existsSync(stylesPath)) {
    cssContent = fs.readFileSync(stylesPath, 'utf-8');
  }
  // Also check inline styles in home HTML
  const styleBlocks = [];
  $home('style').each((_, el) => { styleBlocks.push($home(el).html() || ''); });
  cssContent += '\n' + styleBlocks.join('\n');

  // Extract CSS custom properties
  const cssVars = {};
  const varMatches = cssContent.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;]+)/g);
  for (const m of varMatches) {
    const val = m[2].trim();
    if (val.match(/#[0-9a-fA-F]{3,8}|rgb|hsl/)) {
      cssVars[m[1]] = val;
    }
  }

  // Extract dominant colors from key selectors
  const colorRegex = /(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\))/g;
  const bgSelectors = cssContent.match(/(?:body|header|nav|\.hero|\.banner|\.header|\.site-header|\.nav|\.footer)[^{]*\{[^}]*background[^}]*\}/gi) || [];
  bgSelectors.forEach(block => {
    const matches = block.match(colorRegex);
    if (matches) colors.backgrounds.push(...matches);
  });

  const btnSelectors = cssContent.match(/(?:\.btn|\.button|\.cta|a\.elementor-button|\.elementor-button)[^{]*\{[^}]*\}/gi) || [];
  btnSelectors.forEach(block => {
    const matches = block.match(colorRegex);
    if (matches) colors.accents.push(...matches);
  });

  // Unique colors
  colors.backgrounds = [...new Set(colors.backgrounds)].slice(0, 10);
  colors.accents = [...new Set(colors.accents)].slice(0, 10);
  colors.cssVariables = cssVars;
  console.log(`   Variables CSS con color: ${Object.keys(cssVars).length}`);
  console.log(`   Colores de fondo: ${colors.backgrounds.length}`);
  console.log(`   Colores de acento: ${colors.accents.length}`);

  // Paso 6: Generar sitemap.json con toda la estructura
  const sitemap = {
    site: baseUrl,
    scrapedAt: new Date().toISOString(),
    totalPages: allPages.length,
    totalImages: imgCount,
    branding: {
      logos,
      favicon,
      socialLinks,
      emails,
      colors
    },
    pages: allPages.map(pg => ({
      url: pg.url,
      slug: pg.slug,
      title: pg.title,
      h1: pg.h1,
      metaDescription: pg.metaDescription,
      headings: pg.headings,
      paragraphs: pg.paragraphs,
      lists: pg.lists,
      images: pg.images.map(img => ({
        src: imgMap[img.src] || img.src,
        alt: img.alt
      })),
      internalLinksCount: pg.internalLinks.length
    }))
  };

  fs.writeFileSync(
    path.join(projectDir, 'sitemap.json'),
    JSON.stringify(sitemap, null, 2),
    'utf-8'
  );

  // Resumen
  console.log(`\n═══ Completado ═══`);
  console.log(`   Proyecto: projects/${name}/original/`);
  console.log(`   Páginas: ${allPages.length}`);
  console.log(`   Imágenes: ${imgCount}`);
  console.log(`   Sitemap: sitemap.json`);
  console.log(`   Subpáginas en: pages/`);

  // Clasificar páginas
  console.log(`\n── Estructura del sitio ──`);
  for (const pg of allPages) {
    const label = pg.slug === 'index' ? '(HOME)' : '';
    console.log(`   /${pg.slug}/ — ${pg.h1 || pg.title} ${label} [${pg.paragraphs.length}p, ${pg.images.length}img]`);
  }
  console.log('');
}

scrapeFullSite().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
