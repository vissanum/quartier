#!/usr/bin/env node

/**
 * Genera un informe/showcase comercial para vender el rediseño.
 * Analiza la web original y lista problemas vs mejoras.
 * Uso: node generate-report.js <nombre-proyecto>
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const operator = require('../lib/load-env');

const [,, name] = process.argv;
if (!name) {
  console.error('Uso: node generate-report.js <nombre-proyecto>');
  process.exit(1);
}

const projectDir = path.join(process.cwd(), 'projects', name);
const originalDir = path.join(projectDir, 'original');
const redesignDir = path.join(projectDir, 'redesign');
const config = JSON.parse(fs.readFileSync(path.join(projectDir, 'config.json'), 'utf-8'));
const sitemap = JSON.parse(fs.readFileSync(path.join(originalDir, 'sitemap.json'), 'utf-8'));

// ─── AUDIT: Analizar la web original ───

function auditSite() {
  const homeHtml = fs.readFileSync(path.join(originalDir, 'index.html'), 'utf-8');
  const $ = cheerio.load(homeHtml);

  const audit = {
    score: 0,
    maxScore: 0,
    checks: []
  };

  function check(category, name, pass, impact, detail) {
    const weight = impact === 'critical' ? 15 : impact === 'high' ? 10 : impact === 'medium' ? 5 : 3;
    audit.maxScore += weight;
    if (pass) audit.score += weight;
    audit.checks.push({ category, name, pass, impact, detail, weight });
  }

  // ── SEO ──
  const title = $('title').text().trim();
  check('SEO', 'Tiene título (title tag)', !!title && title.length > 5, 'high',
    title ? `"${title.substring(0, 60)}"` : 'No tiene título');

  const metaDesc = $('meta[name="description"]').attr('content');
  check('SEO', 'Tiene meta description', !!metaDesc && metaDesc.length > 30, 'high',
    metaDesc ? `${metaDesc.length} caracteres` : 'No tiene meta description');

  const ogTitle = $('meta[property="og:title"]').attr('content');
  check('SEO', 'Tiene Open Graph tags', !!ogTitle, 'medium',
    ogTitle ? 'Sí, tiene og:title' : 'No tiene tags para redes sociales');

  const h1s = $('h1');
  check('SEO', 'Tiene un H1 único', h1s.length === 1, 'high',
    h1s.length === 0 ? 'No tiene H1' : h1s.length === 1 ? 'Un H1 correcto' : `${h1s.length} H1s (debería ser uno)`);

  const canonical = $('link[rel="canonical"]').attr('href');
  check('SEO', 'Tiene canonical URL', !!canonical, 'medium',
    canonical ? 'Sí' : 'No tiene canonical');

  // Alt en imágenes
  let totalImgs = 0, imgsWithAlt = 0;
  $('img').each((_, el) => {
    totalImgs++;
    const alt = $(el).attr('alt');
    if (alt && alt.trim().length > 0) imgsWithAlt++;
  });
  check('SEO', 'Imágenes con texto alternativo (alt)', totalImgs > 0 && (imgsWithAlt / totalImgs) > 0.7, 'medium',
    `${imgsWithAlt}/${totalImgs} imágenes tienen alt`);

  // ── RESPONSIVE / MOBILE ──
  const viewport = $('meta[name="viewport"]').attr('content');
  check('Mobile', 'Tiene meta viewport', !!viewport, 'critical',
    viewport ? 'Sí' : 'No tiene — la web no se adapta a móvil');

  // Check if CSS has media queries
  let cssContent = '';
  try { cssContent = fs.readFileSync(path.join(originalDir, 'styles.css'), 'utf-8'); } catch {}
  const mediaQueries = (cssContent.match(/@media/g) || []).length;
  check('Mobile', 'Usa media queries (responsive)', mediaQueries > 3, 'high',
    `${mediaQueries} media queries encontradas`);

  // ── RENDIMIENTO ──
  const htmlSize = Buffer.byteLength(homeHtml, 'utf-8');
  check('Rendimiento', 'Peso del HTML razonable (<500KB)', htmlSize < 500000, 'medium',
    `${(htmlSize / 1024).toFixed(0)} KB`);

  // Count external CSS/JS
  const externalCSS = $('link[rel="stylesheet"]').length;
  const externalJS = $('script[src]').length;
  check('Rendimiento', 'Pocos archivos CSS externos (<10)', externalCSS < 10, 'medium',
    `${externalCSS} archivos CSS`);
  check('Rendimiento', 'Pocos archivos JS externos (<15)', externalJS < 15, 'medium',
    `${externalJS} archivos JS`);

  // ── SEGURIDAD ──
  const isHttps = sitemap.site.startsWith('https');
  check('Seguridad', 'Usa HTTPS', isHttps, 'critical',
    isHttps ? 'Sí, conexión segura' : 'No — los navegadores marcan "No seguro"');

  // ── LEGAL ──
  const pages = sitemap.pages.map(p => p.slug);
  check('Legal', 'Tiene Aviso Legal', pages.some(p => p.includes('aviso-legal')), 'critical',
    'Obligatorio por LSSI-CE');
  check('Legal', 'Tiene Política de Privacidad', pages.some(p => p.includes('privacidad')), 'critical',
    'Obligatorio por RGPD si recoge datos');
  check('Legal', 'Tiene Política de Cookies', pages.some(p => p.includes('cookie')), 'high',
    'Obligatorio si usa cookies (Analytics, etc.)');

  // Check for cookie banner
  const hasCookieBanner = homeHtml.includes('cookie') && (homeHtml.includes('aceptar') || homeHtml.includes('consent'));
  check('Legal', 'Tiene banner de cookies', hasCookieBanner, 'high',
    hasCookieBanner ? 'Tiene algún tipo de banner' : 'No se detecta banner de consentimiento');

  // ── CONTENIDO ──
  const totalPages = sitemap.totalPages;
  check('Contenido', 'Tiene múltiples páginas de contenido', totalPages > 5, 'medium',
    `${totalPages} páginas`);

  // Blog actualizado
  const blogPosts = sitemap.pages.filter(p =>
    p.paragraphs && p.paragraphs.length > 2 && !['index','contacta-con-nosotros','quienes-somos','aviso-legal','politica-de-privacidad','politica-cookies'].includes(p.slug)
  );
  check('Contenido', 'Tiene blog o noticias', blogPosts.length > 0, 'low',
    `${blogPosts.length} artículos encontrados`);

  // ── REDES SOCIALES ──
  const socialLinks = {};
  const socialPatterns = {
    Facebook: /facebook\.com/i, Instagram: /instagram\.com/i,
    Twitter: /twitter\.com|x\.com/i, LinkedIn: /linkedin\.com/i,
    YouTube: /youtube\.com/i, Google_Maps: /google.*maps|maps\.google/i
  };
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    for (const [net, pattern] of Object.entries(socialPatterns)) {
      if (pattern.test(href) && !socialLinks[net]) socialLinks[net] = href;
    }
  });
  const socialCount = Object.keys(socialLinks).length;
  check('Redes', 'Tiene enlaces a redes sociales', socialCount > 0, 'low',
    socialCount > 0 ? Object.keys(socialLinks).join(', ') : 'No se encontraron');

  // ── DISEÑO ──
  // Check for modern CSS features
  const usesFlexbox = cssContent.includes('flex') || homeHtml.includes('flex');
  const usesGrid = cssContent.includes('grid') || homeHtml.includes('display: grid') || homeHtml.includes('display:grid');
  check('Diseño', 'Usa layouts modernos (Flexbox/Grid)', usesFlexbox || usesGrid, 'medium',
    usesFlexbox && usesGrid ? 'Usa Flexbox y Grid' : usesFlexbox ? 'Usa Flexbox' : usesGrid ? 'Usa Grid' : 'No usa layouts modernos');

  // WordPress detection
  const isWordPress = homeHtml.includes('wp-content') || homeHtml.includes('wordpress');
  check('Tecnología', 'Tecnología ligera (no WordPress pesado)', !isWordPress, 'medium',
    isWordPress ? 'WordPress con muchos plugins (carga lenta)' : 'Sitio ligero');

  return audit;
}

// ─── Count redesign files ───
function countRedesignFiles() {
  const count = { treatments: 0, blog: 0, pages: 0, legal: 0 };

  try {
    count.treatments = fs.readdirSync(path.join(redesignDir, 'tratamientos')).filter(f => f.endsWith('.html')).length;
  } catch {}
  try {
    count.blog = fs.readdirSync(path.join(redesignDir, 'blog')).filter(f => f.endsWith('.html')).length;
  } catch {}

  const rootFiles = fs.readdirSync(redesignDir).filter(f => f.endsWith('.html'));
  count.pages = rootFiles.length;
  count.legal = rootFiles.filter(f => ['aviso-legal.html', 'politica-privacidad.html', 'politica-cookies.html'].includes(f)).length;

  return count;
}

// ─── GENERATE REPORT HTML ───
function generateReport() {
  const audit = auditSite();
  const files = countRedesignFiles();
  const scorePercent = Math.round((audit.score / audit.maxScore) * 100);

  const categories = {};
  for (const c of audit.checks) {
    if (!categories[c.category]) categories[c.category] = [];
    categories[c.category].push(c);
  }

  // Score color
  const scoreColor = scorePercent >= 70 ? '#2d8a4e' : scorePercent >= 40 ? '#c9860b' : '#c93b1c';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Informe de Rediseño Web — ${config.name}</title>
  <style>
    :root {
      --teal: #14505C;
      --teal-light: #1B6E7B;
      --cream: #FAF7F2;
      --cream-mid: #F3EDE4;
      --cream-dark: #E8DFD1;
      --surface: #FFFFFF;
      --text: #1C2A2D;
      --text-body: #445558;
      --text-muted: #7A908F;
      --red: #c93b1c;
      --orange: #c9860b;
      --green: #2d8a4e;
      --red-bg: #fef2f0;
      --orange-bg: #fef8f0;
      --green-bg: #f0fef4;
      --serif: Georgia, 'Times New Roman', serif;
      --sans: 'Segoe UI', -apple-system, system-ui, sans-serif;
      --radius: 16px;
      --shadow: 0 4px 32px rgba(20, 80, 92, 0.08);
    }
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--sans); background: var(--cream); color: var(--text-body); line-height: 1.7; }
    .container { max-width: 900px; margin: 0 auto; padding: 0 28px; }

    /* Header */
    .report-header { background: var(--teal); color: #fff; padding: 56px 0 48px; position: relative; overflow: hidden; }
    .report-header::before { content: ''; position: absolute; top: -30%; right: -5%; width: 400px; height: 400px; background: radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%); border-radius: 50%; }
    .report-badge { display: inline-block; background: rgba(255,255,255,0.12); padding: 6px 16px; border-radius: 100px; font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 20px; }
    .report-header h1 { font-family: var(--serif); font-size: clamp(1.8rem, 3.5vw, 2.6rem); font-weight: 400; letter-spacing: -0.02em; margin-bottom: 8px; }
    .report-header p { opacity: 0.75; font-size: 1.05rem; max-width: 500px; }
    .report-header .meta { margin-top: 24px; display: flex; gap: 24px; font-size: 0.85rem; opacity: 0.6; }

    /* Score */
    .score-section { padding: 48px 0; }
    .score-card { background: var(--surface); border-radius: var(--radius); padding: 40px; box-shadow: var(--shadow); display: flex; align-items: center; gap: 40px; }
    .score-ring { position: relative; width: 140px; height: 140px; flex-shrink: 0; }
    .score-ring svg { transform: rotate(-90deg); width: 140px; height: 140px; }
    .score-ring .bg { fill: none; stroke: var(--cream-dark); stroke-width: 10; }
    .score-ring .fg { fill: none; stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 1s ease; }
    .score-number { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-family: var(--serif); font-size: 2.4rem; color: var(--text); line-height: 1; }
    .score-number small { font-size: 0.9rem; color: var(--text-muted); display: block; text-align: center; margin-top: 2px; font-family: var(--sans); }
    .score-text h2 { font-family: var(--serif); font-size: 1.5rem; color: var(--text); margin-bottom: 8px; font-weight: 400; }
    .score-text p { color: var(--text-muted); font-size: 0.95rem; }

    /* Audit */
    .audit-section { padding: 0 0 56px; }
    .category { margin-bottom: 32px; }
    .category-title { font-family: var(--serif); font-size: 1.2rem; color: var(--text); margin-bottom: 12px; font-weight: 400; padding-bottom: 8px; border-bottom: 1px solid var(--cream-dark); }
    .check-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-radius: 10px; margin-bottom: 6px; font-size: 0.9rem; }
    .check-pass { background: var(--green-bg); }
    .check-fail { background: var(--red-bg); }
    .check-icon { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0; color: #fff; font-weight: 700; margin-top: 2px; }
    .check-pass .check-icon { background: var(--green); }
    .check-fail .check-icon { background: var(--red); }
    .check-name { font-weight: 600; color: var(--text); }
    .check-detail { color: var(--text-muted); font-size: 0.82rem; margin-top: 2px; }
    .check-impact { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 8px; border-radius: 100px; margin-left: auto; flex-shrink: 0; font-weight: 600; }
    .impact-critical { background: rgba(201,59,28,0.1); color: var(--red); }
    .impact-high { background: rgba(201,134,11,0.1); color: var(--orange); }
    .impact-medium { background: rgba(45,138,78,0.08); color: var(--text-muted); }
    .impact-low { background: var(--cream-mid); color: var(--text-muted); }

    /* Redesign includes */
    .includes-section { padding: 56px 0; background: var(--surface); }
    .includes-title { font-family: var(--serif); font-size: 1.6rem; color: var(--text); margin-bottom: 32px; font-weight: 400; text-align: center; }
    .includes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .include-card { background: var(--green-bg); border-radius: 12px; padding: 20px; }
    .include-card .num { font-family: var(--serif); font-size: 2rem; color: var(--green); line-height: 1; }
    .include-card .label { font-size: 0.88rem; color: var(--text); font-weight: 500; margin-top: 4px; }
    .include-card .desc { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }

    /* Features list */
    .features-list { list-style: none; margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .features-list li { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--cream); border-radius: 10px; font-size: 0.88rem; color: var(--text); }
    .features-list .icon { color: var(--green); font-weight: 700; font-size: 1.1rem; }

    /* CTA */
    .cta-section { padding: 64px 0; background: var(--teal); text-align: center; }
    .cta-section h2 { font-family: var(--serif); font-size: 1.8rem; color: #fff; font-weight: 400; margin-bottom: 8px; }
    .cta-section p { color: rgba(255,255,255,0.7); margin-bottom: 28px; font-size: 1rem; }
    .cta-btn { display: inline-flex; align-items: center; gap: 10px; background: #fff; color: var(--teal); padding: 16px 40px; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 1rem; transition: transform 0.3s; }
    .cta-btn:hover { transform: translateY(-2px); }

    /* Footer */
    .report-footer { padding: 32px 0; text-align: center; color: var(--text-muted); font-size: 0.82rem; }
    .report-footer a { color: var(--teal-light); text-decoration: none; }

    /* Screenshots */
    .screenshots { padding: 48px 0; }
    .screenshots h2 { font-family: var(--serif); font-size: 1.4rem; color: var(--text); margin-bottom: 24px; font-weight: 400; text-align: center; }
    .screenshots-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .screenshot-col { text-align: center; }
    .screenshot-col img { max-width: 100%; border-radius: 12px; box-shadow: var(--shadow); border: 1px solid var(--cream-dark); }
    .screenshot-label { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 12px; font-weight: 600; }
    .screenshot-label.before { color: var(--red); }
    .screenshot-label.after { color: var(--green); }

    /* Preview btn */
    .preview-section { padding: 32px 0 56px; text-align: center; }
    .preview-btn { display: inline-flex; align-items: center; gap: 10px; background: var(--teal-light); color: #fff; padding: 16px 40px; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 1rem; transition: all 0.3s; box-shadow: 0 4px 24px rgba(20,80,92,0.25); }
    .preview-btn:hover { background: var(--teal); transform: translateY(-2px); }

    @media (max-width: 768px) {
      .score-card { flex-direction: column; text-align: center; }
      .features-list { grid-template-columns: 1fr; }
      .screenshots-grid { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: #fff; }
      .cta-section, .report-footer { page-break-before: auto; }
    }
  </style>
</head>
<body>

  <div class="report-header">
    <div class="container">
      <div class="report-badge">Informe de Rediseño Web</div>
      <h1>Propuesta para ${config.name}</h1>
      <p>Análisis completo de tu web actual y propuesta de rediseño profesional.</p>
      <div class="meta">
        <span>Fecha: ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <span>Por: ${operator.name}</span>
      </div>
    </div>
  </div>

  <section class="score-section">
    <div class="container">
      <div class="score-card">
        <div class="score-ring">
          <svg viewBox="0 0 140 140">
            <circle class="bg" cx="70" cy="70" r="58"/>
            <circle class="fg" cx="70" cy="70" r="58"
              stroke="${scoreColor}"
              stroke-dasharray="${Math.round(2 * Math.PI * 58)}"
              stroke-dashoffset="${Math.round(2 * Math.PI * 58 * (1 - scorePercent / 100))}"/>
          </svg>
          <div class="score-number">${scorePercent}<small>/ 100</small></div>
        </div>
        <div class="score-text">
          <h2>${scorePercent >= 70 ? 'Tu web está bien, pero puede mejorar' : scorePercent >= 40 ? 'Tu web necesita mejoras importantes' : 'Tu web tiene problemas serios'}</h2>
          <p>Hemos analizado ${audit.checks.length} aspectos clave de tu página web: SEO, diseño responsive, rendimiento, seguridad, contenido y cumplimiento legal.
          ${audit.checks.filter(c => !c.pass).length > 0 ? ` Se han detectado <strong>${audit.checks.filter(c => !c.pass).length} problemas</strong> que están afectando a tu presencia online.` : ''}</p>
        </div>
      </div>
    </div>
  </section>

  <section class="audit-section">
    <div class="container">
      ${Object.entries(categories).map(([cat, checks]) => `
      <div class="category">
        <h3 class="category-title">${cat}</h3>
        ${checks.map(c => `
        <div class="check-item ${c.pass ? 'check-pass' : 'check-fail'}">
          <div class="check-icon">${c.pass ? '✓' : '✗'}</div>
          <div>
            <div class="check-name">${c.name}</div>
            <div class="check-detail">${c.detail}</div>
          </div>
          <span class="check-impact impact-${c.impact}">${c.impact}</span>
        </div>`).join('')}
      </div>`).join('')}
    </div>
  </section>

  <section class="includes-section">
    <div class="container">
      <h2 class="includes-title">Qué incluye el rediseño</h2>
      <div class="includes-grid">
        <div class="include-card">
          <div class="num">${files.pages}</div>
          <div class="label">Páginas totales</div>
          <div class="desc">Home, contacto, sobre nosotros, índices...</div>
        </div>
        <div class="include-card">
          <div class="num">${files.treatments}</div>
          <div class="label">Páginas de servicios</div>
          <div class="desc">Cada tratamiento con su propia página</div>
        </div>
        <div class="include-card">
          <div class="num">${files.blog}</div>
          <div class="label">Artículos de blog</div>
          <div class="desc">Todo tu contenido migrado y rediseñado</div>
        </div>
        <div class="include-card">
          <div class="num">${files.legal}</div>
          <div class="label">Páginas legales</div>
          <div class="desc">Aviso legal, privacidad, cookies + banner</div>
        </div>
      </div>

      <ul class="features-list">
        <li><span class="icon">✓</span> Diseño moderno y profesional</li>
        <li><span class="icon">✓</span> 100% responsive (móvil, tablet, PC)</li>
        <li><span class="icon">✓</span> Optimizado para Google (SEO)</li>
        <li><span class="icon">✓</span> Carga ultra-rápida (sin WordPress)</li>
        <li><span class="icon">✓</span> Cumplimiento legal completo (RGPD, LSSI)</li>
        <li><span class="icon">✓</span> Banner de cookies funcional</li>
        <li><span class="icon">✓</span> Botón de llamada directo (CTA)</li>
        <li><span class="icon">✓</span> Enlace a Google Maps</li>
        <li><span class="icon">✓</span> Redes sociales integradas</li>
        <li><span class="icon">✓</span> Blog completo migrado</li>
        <li><span class="icon">✓</span> Colores de tu marca mantenidos</li>
        <li><span class="icon">✓</span> Sin cuotas mensuales de WordPress</li>
      </ul>
    </div>
  </section>

  <section class="preview-section">
    <div class="container">
      <a href="redesign/index.html" class="preview-btn">
        Ver el rediseño en vivo →
      </a>
    </div>
  </section>

  <section class="cta-section">
    <div class="container">
      <h2>¿Hablamos?</h2>
      <p>Puedo tener tu nueva web lista en pocos días.</p>
      <a href="mailto:${operator.email}" class="cta-btn">Contactar con ${operator.name.split(' ')[0]}</a>
    </div>
  </section>

  <div class="report-footer">
    <div class="container">
      <p>Informe generado por <a href="${operator.website}" target="_blank">${operator.website.replace('https://', '')}</a></p>
    </div>
  </div>

</body>
</html>`;

  return html;
}

// ─── RUN ───
console.log(`\n═══ Generando informe para: ${config.name} ═══\n`);

const audit = auditSite();
const scorePercent = Math.round((audit.score / audit.maxScore) * 100);

console.log(`── Auditoría ──`);
console.log(`   Puntuación: ${scorePercent}/100`);
console.log('');
for (const c of audit.checks) {
  const icon = c.pass ? '  ✓' : '  ✗';
  console.log(`${icon} [${c.impact}] ${c.name} — ${c.detail}`);
}

const files = countRedesignFiles();
console.log(`\n── Rediseño incluye ──`);
console.log(`   Páginas totales: ${files.pages}`);
console.log(`   Tratamientos/servicios: ${files.treatments}`);
console.log(`   Artículos de blog: ${files.blog}`);
console.log(`   Páginas legales: ${files.legal}`);

const reportHtml = generateReport();
const reportPath = path.join(projectDir, 'informe.html');
fs.writeFileSync(reportPath, reportHtml, 'utf-8');

console.log(`\n═══ Informe guardado: projects/${name}/informe.html ═══\n`);
