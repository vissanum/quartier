#!/usr/bin/env node

/**
 * Generador de sitio completo a partir de sitemap.json
 * Uso: node generate-site.js <nombre-proyecto>
 *
 * Lee projects/<nombre>/original/sitemap.json y genera
 * todas las páginas en projects/<nombre>/redesign/
 */

const fs = require('fs');
const path = require('path');

const [,, name] = process.argv;
if (!name) {
  console.error('Uso: node generate-site.js <nombre-proyecto>');
  process.exit(1);
}

const projectDir = path.join(process.cwd(), 'projects', name);
const originalDir = path.join(projectDir, 'original');
const redesignDir = path.join(projectDir, 'redesign');

// Cargar sitemap
const sitemap = JSON.parse(fs.readFileSync(path.join(originalDir, 'sitemap.json'), 'utf-8'));

// Cargar config del sitio (creada manualmente tras el análisis)
const configPath = path.join(projectDir, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error(`Falta ${configPath}. Crea el config.json con los datos del negocio.`);
  console.error('Mira config.example.json para ver la estructura.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// ─── Crear directorios ───
fs.mkdirSync(path.join(redesignDir, 'tratamientos'), { recursive: true });
fs.mkdirSync(path.join(redesignDir, 'blog'), { recursive: true });

// ─── CSS compartido ───
function getCSS() {
  const c = config.colors;
  return `
    :root {
      --primary: ${c.primary};
      --primary-deep: ${c.primaryDeep};
      --primary-mid: ${c.primaryMid};
      --primary-light: ${c.primaryLight};
      --primary-glass: ${c.primaryGlass};
      --bg: ${c.bg};
      --bg-mid: ${c.bgMid};
      --bg-dark: ${c.bgDark};
      --sand: ${c.sand || '#C4B49A'};
      --surface: ${c.surface};
      --text-primary: ${c.textPrimary};
      --text-body: ${c.textBody};
      --text-muted: ${c.textMuted};
      --shadow-soft: 0 2px 20px rgba(20, 80, 92, 0.06);
      --shadow-card: 0 4px 32px rgba(20, 80, 92, 0.08);
      --shadow-hover: 0 8px 40px rgba(20, 80, 92, 0.12);
      --radius: 16px;
      --radius-sm: 10px;
      --radius-pill: 100px;
      --serif: Georgia, 'Times New Roman', 'Palatino Linotype', serif;
      --sans: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      --ease: cubic-bezier(0.4, 0, 0.2, 1);
    }

    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 90px; }
    body {
      font-family: var(--sans); background: var(--bg); color: var(--text-body);
      line-height: 1.7; -webkit-font-smoothing: antialiased; overflow-x: hidden;
    }
    body::after {
      content: ''; position: fixed; inset: 0;
      background-image:
        linear-gradient(rgba(27, 110, 123, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(27, 110, 123, 0.03) 1px, transparent 1px);
      background-size: 80px 80px; pointer-events: none; z-index: 0;
    }
    .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.7s var(--ease), transform 0.7s var(--ease); }
    .reveal.visible { opacity: 1; transform: translateY(0); }
    .reveal-delay-1 { transition-delay: 0.1s; }
    .reveal-delay-2 { transition-delay: 0.2s; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 28px; position: relative; z-index: 1; }
    a { color: var(--primary); text-decoration: none; transition: color 0.3s var(--ease); }
    a:hover { color: var(--primary-deep); }

    /* Nav */
    .nav { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; padding: 0 28px; background: rgba(250, 247, 242, 0.92); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 1px 0 rgba(20, 80, 92, 0.06); }
    .nav-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 14px 0; }
    .nav-logo { font-family: var(--serif); font-size: 1.5rem; color: var(--primary-deep); text-decoration: none; letter-spacing: -0.02em; }
    .nav-logo span { color: var(--primary); font-style: italic; }
    .nav-links { display: flex; align-items: center; gap: 28px; list-style: none; }
    .nav-links a { color: var(--text-body); text-decoration: none; font-size: 0.88rem; letter-spacing: 0.02em; }
    .nav-links a:hover { color: var(--primary-deep); }
    .nav-cta { background: var(--primary); color: #fff !important; padding: 10px 24px; border-radius: var(--radius-pill); font-size: 0.85rem !important; font-weight: 600; box-shadow: 0 2px 12px rgba(27, 110, 123, 0.2); transition: all 0.3s var(--ease) !important; }
    .nav-cta:hover { background: var(--primary-deep) !important; transform: translateY(-1px); }
    .nav-toggle { display: none; background: none; border: none; cursor: pointer; width: 32px; height: 24px; position: relative; z-index: 1001; }
    .nav-toggle span { display: block; width: 100%; height: 2px; background: var(--primary-deep); border-radius: 2px; transition: all 0.3s var(--ease); position: absolute; left: 0; }
    .nav-toggle span:nth-child(1) { top: 0; }
    .nav-toggle span:nth-child(2) { top: 50%; transform: translateY(-50%); }
    .nav-toggle span:nth-child(3) { bottom: 0; }
    .nav-toggle.active span:nth-child(1) { top: 50%; transform: translateY(-50%) rotate(45deg); }
    .nav-toggle.active span:nth-child(2) { opacity: 0; }
    .nav-toggle.active span:nth-child(3) { bottom: 50%; transform: translateY(50%) rotate(-45deg); }

    /* Footer */
    .footer { background: var(--primary-deep); padding: 48px 0; position: relative; z-index: 1; }
    .footer-inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 24px; }
    .footer-logo { font-family: var(--serif); font-size: 1.3rem; color: #fff; }
    .footer-logo span { opacity: 0.7; font-style: italic; }
    .footer-links { display: flex; gap: 28px; list-style: none; }
    .footer-links a { color: rgba(255,255,255,0.6); font-size: 0.85rem; }
    .footer-links a:hover { color: #fff; }
    .footer-bottom { margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); text-align: center; color: rgba(255,255,255,0.35); font-size: 0.82rem; }

    /* Section */
    .section-label { display: inline-flex; align-items: center; gap: 10px; font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary); margin-bottom: 16px; font-weight: 600; }
    .section-label::before { content: ''; width: 24px; height: 1.5px; background: var(--primary-mid); }
    .section-title { font-family: var(--serif); font-size: clamp(1.8rem, 3.5vw, 2.6rem); color: var(--primary-deep); line-height: 1.2; letter-spacing: -0.02em; margin-bottom: 20px; font-weight: 400; }

    /* Buttons */
    .btn-primary { display: inline-flex; align-items: center; gap: 10px; background: var(--primary); color: #fff; padding: 14px 32px; border-radius: var(--radius-pill); font-size: 0.95rem; font-weight: 600; transition: all 0.35s var(--ease); box-shadow: 0 4px 24px rgba(27, 110, 123, 0.25); text-decoration: none; }
    .btn-primary:hover { background: var(--primary-deep); color: #fff; transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27, 110, 123, 0.35); }
    .btn-outline { display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid var(--primary); color: var(--primary); padding: 12px 28px; border-radius: var(--radius-pill); font-size: 0.9rem; font-weight: 600; transition: all 0.3s var(--ease); text-decoration: none; }
    .btn-outline:hover { background: var(--primary); color: #fff; }

    /* Page header */
    .page-header { padding: 140px 0 60px; position: relative; }
    .page-header::before { content: ''; position: absolute; top: 0; right: -10%; width: 500px; height: 500px; background: radial-gradient(circle, var(--primary-glass) 0%, transparent 70%); border-radius: 50%; pointer-events: none; }
    .breadcrumb { font-size: 0.82rem; color: var(--text-muted); margin-bottom: 16px; }
    .breadcrumb a { color: var(--primary); }
    .page-header h1 { font-family: var(--serif); font-size: clamp(2rem, 4vw, 3rem); color: var(--primary-deep); line-height: 1.2; font-weight: 400; letter-spacing: -0.02em; }
    .page-header p { font-size: 1.1rem; color: var(--text-muted); max-width: 600px; margin-top: 16px; line-height: 1.8; }

    /* Content */
    .content-section { padding: 60px 0 100px; }
    .content-body { max-width: 720px; }
    .content-body p { margin-bottom: 20px; font-size: 1.02rem; line-height: 1.85; }
    .content-body h2 { font-family: var(--serif); font-size: 1.6rem; color: var(--primary-deep); margin: 40px 0 16px; font-weight: 400; }
    .content-body h3 { font-family: var(--serif); font-size: 1.3rem; color: var(--primary-deep); margin: 32px 0 12px; font-weight: 400; }
    .content-body ul, .content-body ol { margin: 0 0 20px 24px; }
    .content-body li { margin-bottom: 8px; }

    /* Treatment card grid */
    .related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; margin-top: 48px; }
    .related-card { background: var(--surface); border: 1px solid var(--bg-dark); border-radius: var(--radius); padding: 28px 24px; transition: all 0.3s var(--ease); text-decoration: none; }
    .related-card:hover { border-color: rgba(27, 110, 123, 0.15); transform: translateY(-3px); box-shadow: var(--shadow-card); }
    .related-card .icon { font-size: 1.5rem; margin-bottom: 12px; display: block; }
    .related-card .name { font-family: var(--serif); font-size: 1.05rem; color: var(--primary-deep); }

    /* Blog list */
    .blog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; margin-top: 48px; }
    .blog-card { background: var(--surface); border: 1px solid var(--bg-dark); border-radius: var(--radius); overflow: hidden; transition: all 0.3s var(--ease); text-decoration: none; display: block; }
    .blog-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-card); }
    .blog-card-body { padding: 28px; }
    .blog-card h3 { font-family: var(--serif); font-size: 1.15rem; color: var(--primary-deep); margin-bottom: 10px; font-weight: 400; line-height: 1.4; }
    .blog-card p { font-size: 0.9rem; color: var(--text-muted); line-height: 1.6; }

    /* CTA band */
    .cta-band { padding: 72px 0; background: var(--primary-deep); text-align: center; position: relative; z-index: 1; }
    .cta-band h2 { font-family: var(--serif); font-size: clamp(1.6rem, 3vw, 2.2rem); color: #fff; margin-bottom: 12px; font-weight: 400; }
    .cta-band p { color: rgba(255,255,255,0.7); margin-bottom: 28px; }
    .btn-white { display: inline-flex; align-items: center; gap: 10px; background: #fff; color: var(--primary-deep); padding: 14px 36px; border-radius: var(--radius-pill); font-size: 0.95rem; font-weight: 600; transition: all 0.35s var(--ease); text-decoration: none; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
    .btn-white:hover { transform: translateY(-2px); color: var(--primary-deep); box-shadow: 0 8px 32px rgba(0,0,0,0.15); }

    /* Contact */
    .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 40px; }
    .contact-item { display: flex; align-items: flex-start; gap: 18px; padding: 24px 0; border-bottom: 1px solid var(--bg-dark); }
    .contact-item:last-child { border-bottom: none; }
    .contact-icon { width: 44px; height: 44px; background: var(--primary-light); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; }
    .contact-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 4px; }
    .contact-value { font-size: 1.02rem; color: var(--primary-deep); font-weight: 500; }
    .contact-value a { color: inherit; }

    /* About */
    .team-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 48px; }
    .team-card { background: var(--surface); border-radius: var(--radius); padding: 40px; box-shadow: var(--shadow-card); position: relative; overflow: hidden; }
    .team-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, var(--primary), var(--primary-mid)); }
    .team-card h3 { font-family: var(--serif); font-size: 1.35rem; color: var(--primary-deep); margin-bottom: 16px; font-weight: 400; }
    .team-card ul { list-style: none; padding: 0; }
    .team-card li { padding: 6px 0; font-size: 0.9rem; color: var(--text-body); border-bottom: 1px solid var(--bg-dark); }
    .team-card li:last-child { border-bottom: none; }

    /* Responsive */
    @media (max-width: 768px) {
      .nav-links { display: none; }
      .nav-toggle { display: block; }
      .nav-links.open { display: flex; flex-direction: column; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(250,247,242,0.98); backdrop-filter: blur(20px); justify-content: center; align-items: center; gap: 28px; z-index: 999; }
      .nav-links.open a { font-size: 1.2rem; }
      .page-header { padding: 110px 0 40px; }
      .contact-grid, .team-grid { grid-template-columns: 1fr; }
      .related-grid { grid-template-columns: 1fr 1fr; }
      .blog-grid { grid-template-columns: 1fr; }
      .footer-inner { flex-direction: column; text-align: center; }
    }
    @media (max-width: 480px) {
      .related-grid { grid-template-columns: 1fr; }
    }
  `;
}

// ─── Nav HTML ───
function getNav(rootPath = '') {
  return `
  <nav class="nav">
    <div class="nav-inner">
      <a href="${rootPath}index.html" class="nav-logo">${config.logoText} <span>${config.logoTextItalic}</span></a>
      <ul class="nav-links" id="navLinks">
        <li><a href="${rootPath}sobre-nosotros.html">Sobre nosotros</a></li>
        <li><a href="${rootPath}tratamientos.html">Tratamientos</a></li>
        <li><a href="${rootPath}blog.html">Blog</a></li>
        <li><a href="${rootPath}contacto.html">Contacto</a></li>
        <li><a href="tel:${config.phone.replace(/\s/g, '')}" class="nav-cta">Pide tu cita</a></li>
      </ul>
      <button class="nav-toggle" id="navToggle" aria-label="Menú"><span></span><span></span><span></span></button>
    </div>
  </nav>`;
}

// ─── Footer HTML ───
function getFooter() {
  return `
  <footer class="footer">
    <div class="container">
      <div class="footer-inner">
        <div class="footer-logo">${config.logoText} <span>${config.logoTextItalic}</span></div>
        <ul class="footer-links">
          <li><a href="sobre-nosotros.html">Sobre nosotros</a></li>
          <li><a href="tratamientos.html">Tratamientos</a></li>
          <li><a href="blog.html">Blog</a></li>
          <li><a href="contacto.html">Contacto</a></li>
        </ul>
      </div>
      <div class="footer-bottom">&copy; ${new Date().getFullYear()} ${config.name}. Todos los derechos reservados.</div>
    </div>
  </footer>`;
}

// ─── JS compartido ───
function getJS() {
  return `
  <script>
    document.querySelectorAll('.reveal').forEach(el => {
      new IntersectionObserver((entries, obs) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }).observe(el);
    });
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    if (toggle) {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        links.classList.toggle('open');
        document.body.style.overflow = links.classList.contains('open') ? 'hidden' : '';
      });
      links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
        toggle.classList.remove('active'); links.classList.remove('open');
        document.body.style.overflow = '';
      }));
    }
  </script>`;
}

// ─── CTA Band ───
function getCTABand() {
  return `
  <section class="cta-band">
    <div class="container">
      <h2 class="reveal">${config.ctaTitle}</h2>
      <p class="reveal reveal-delay-1">${config.ctaSubtitle}</p>
      <a href="tel:${config.phone.replace(/\s/g, '')}" class="btn-white reveal reveal-delay-2">${config.ctaButton}</a>
    </div>
  </section>`;
}

// ─── Page wrapper ───
function page(title, description, bodyHTML, rootPath = '') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <style>${getCSS()}</style>
</head>
<body>
  ${getNav(rootPath)}
  ${bodyHTML}
  ${getFooter()}
  ${getJS()}
</body>
</html>`;
}

// ─── Helpers ───
function getPageContent(slug) {
  const pg = sitemap.pages.find(p => p.slug === slug);
  if (!pg) return null;
  // Filter out junk paragraphs
  const cleanParagraphs = pg.paragraphs.filter(p =>
    p.length > 30 &&
    !p.includes('correo electrónico') &&
    !p.includes('debes estar conectado') &&
    !p.includes('política de privacidad') &&
    !p.includes('He leido y acepto')
  );
  return { ...pg, paragraphs: cleanParagraphs };
}

function treatmentIcon(slug) {
  const icons = config.treatmentIcons || {};
  return icons[slug] || '&#128161;';
}

// ─── GENERATE TREATMENT PAGE ───
function generateTreatment(slug) {
  const pg = getPageContent(slug);
  if (!pg) return;

  const treatmentName = pg.h1 || pg.title.replace(' - Psico Deusto', '').replace(' - ' + config.name, '');
  // Only use the first few paragraphs that are about THIS treatment (not related entries)
  const ownContent = pg.paragraphs.slice(0, 3);
  const relatedTreatments = config.treatments.filter(t => t.slug !== slug).slice(0, 6);

  const body = `
  <section class="page-header">
    <div class="container">
      <div class="breadcrumb reveal"><a href="../index.html">Inicio</a> / <a href="../tratamientos.html">Tratamientos</a> / ${treatmentName}</div>
      <h1 class="reveal reveal-delay-1">${treatmentName}</h1>
    </div>
  </section>
  <section class="content-section">
    <div class="container">
      <div class="content-body">
        ${ownContent.map(p => `<p class="reveal">${p}</p>`).join('\n        ')}
      </div>
      ${getCTABand()}
      <div class="section-label reveal" style="margin-top:64px;">Otros tratamientos</div>
      <div class="related-grid">
        ${relatedTreatments.map(t => `
        <a href="${t.slug}.html" class="related-card reveal">
          <span class="icon">${t.icon}</span>
          <span class="name">${t.name}</span>
        </a>`).join('')}
      </div>
    </div>
  </section>`;

  const html = page(
    `${treatmentName} — ${config.name}`,
    `Tratamiento de ${treatmentName.toLowerCase()} en ${config.city}. ${config.name}.`,
    body,
    '../'
  );

  fs.writeFileSync(path.join(redesignDir, 'tratamientos', `${slug}.html`), html, 'utf-8');
}

// ─── GENERATE BLOG POST ───
function generateBlogPost(slug) {
  const pg = getPageContent(slug);
  if (!pg) return;

  const postTitle = pg.h1 || pg.title.replace(' - Psico Deusto', '').replace(' - ' + config.name, '');
  const ownContent = pg.paragraphs.slice(0, 5);

  const body = `
  <section class="page-header">
    <div class="container">
      <div class="breadcrumb reveal"><a href="../index.html">Inicio</a> / <a href="../blog.html">Blog</a> / ${postTitle}</div>
      <h1 class="reveal reveal-delay-1">${postTitle}</h1>
    </div>
  </section>
  <section class="content-section">
    <div class="container">
      <div class="content-body">
        ${ownContent.map(p => `<p class="reveal">${p}</p>`).join('\n        ')}
      </div>
      ${getCTABand()}
    </div>
  </section>`;

  const html = page(
    `${postTitle} — ${config.name}`,
    ownContent[0] ? ownContent[0].substring(0, 160) : `${postTitle} - ${config.name}`,
    body,
    '../'
  );

  fs.writeFileSync(path.join(redesignDir, 'blog', `${slug}.html`), html, 'utf-8');
}

// ─── GENERATE TREATMENTS INDEX ───
function generateTreatmentsIndex() {
  const body = `
  <section class="page-header">
    <div class="container">
      <div class="breadcrumb reveal"><a href="index.html">Inicio</a> / Tratamientos</div>
      <h1 class="reveal reveal-delay-1">Nuestros Tratamientos</h1>
      <p class="reveal reveal-delay-2">Abordamos una amplia variedad de dificultades emocionales y psicológicas con un enfoque profesional y cercano.</p>
    </div>
  </section>
  <section class="content-section">
    <div class="container">
      <div class="related-grid">
        ${config.treatments.map(t => `
        <a href="tratamientos/${t.slug}.html" class="related-card reveal">
          <span class="icon">${t.icon}</span>
          <span class="name">${t.name}</span>
        </a>`).join('')}
      </div>
    </div>
  </section>
  ${getCTABand()}`;

  fs.writeFileSync(path.join(redesignDir, 'tratamientos.html'), page(
    `Tratamientos — ${config.name}`,
    `Todos nuestros tratamientos de psicología clínica en ${config.city}.`,
    body
  ), 'utf-8');
}

// ─── GENERATE BLOG INDEX ───
function generateBlogIndex() {
  const body = `
  <section class="page-header">
    <div class="container">
      <div class="breadcrumb reveal"><a href="index.html">Inicio</a> / Blog</div>
      <h1 class="reveal reveal-delay-1">Blog y Noticias</h1>
      <p class="reveal reveal-delay-2">Artículos sobre psicología, bienestar emocional y salud mental.</p>
    </div>
  </section>
  <section class="content-section">
    <div class="container">
      <div class="blog-grid">
        ${config.blogPosts.map(post => {
          const pg = getPageContent(post.slug);
          const excerpt = pg && pg.paragraphs[0] ? pg.paragraphs[0].substring(0, 120) + '...' : '';
          return `
        <a href="blog/${post.slug}.html" class="blog-card reveal">
          <div class="blog-card-body">
            <h3>${post.title}</h3>
            <p>${excerpt}</p>
          </div>
        </a>`;
        }).join('')}
      </div>
    </div>
  </section>`;

  fs.writeFileSync(path.join(redesignDir, 'blog.html'), page(
    `Blog — ${config.name}`,
    `Artículos sobre psicología y bienestar emocional. ${config.name}.`,
    body
  ), 'utf-8');
}

// ─── GENERATE ABOUT ───
function generateAbout() {
  const pg = getPageContent('quienes-somos');
  const body = `
  <section class="page-header">
    <div class="container">
      <div class="breadcrumb reveal"><a href="index.html">Inicio</a> / Sobre nosotros</div>
      <h1 class="reveal reveal-delay-1">Sobre Nosotros</h1>
      <p class="reveal reveal-delay-2">${config.about}</p>
    </div>
  </section>
  <section class="content-section">
    <div class="container">
      <div class="team-grid">
        ${config.team.map(member => `
        <div class="team-card reveal">
          <h3>${member.name}</h3>
          <ul>
            ${member.credentials.map(c => `<li>${c}</li>`).join('\n            ')}
          </ul>
        </div>`).join('')}
      </div>
    </div>
  </section>
  ${getCTABand()}`;

  fs.writeFileSync(path.join(redesignDir, 'sobre-nosotros.html'), page(
    `Sobre Nosotros — ${config.name}`,
    `Conoce al equipo de ${config.name}. Más de 20 años de experiencia en psicología clínica.`,
    body
  ), 'utf-8');
}

// ─── GENERATE CONTACT ───
function generateContact() {
  const body = `
  <section class="page-header">
    <div class="container">
      <div class="breadcrumb reveal"><a href="index.html">Inicio</a> / Contacto</div>
      <h1 class="reveal reveal-delay-1">Contacto</h1>
      <p class="reveal reveal-delay-2">No dudes en contactarnos para resolver cualquier duda o pedir tu primera cita.</p>
    </div>
  </section>
  <section class="content-section">
    <div class="container">
      <div class="contact-grid">
        <div>
          <div class="contact-item reveal">
            <div class="contact-icon">&#128222;</div>
            <div><div class="contact-label">Teléfono</div><div class="contact-value"><a href="tel:${config.phone.replace(/\s/g, '')}">${config.phone}</a></div></div>
          </div>
          <div class="contact-item reveal reveal-delay-1">
            <div class="contact-icon">&#9993;</div>
            <div><div class="contact-label">Email</div><div class="contact-value"><a href="mailto:${config.email}">${config.email}</a></div></div>
          </div>
          <div class="contact-item reveal reveal-delay-2">
            <div class="contact-icon">&#128205;</div>
            <div><div class="contact-label">Dirección</div><div class="contact-value">${config.address}</div></div>
          </div>
          <div class="contact-item reveal reveal-delay-3">
            <div class="contact-icon">&#128337;</div>
            <div><div class="contact-label">Horario</div><div class="contact-value">${config.hours}</div></div>
          </div>
        </div>
        <div class="reveal reveal-delay-2" style="background:var(--surface);border-radius:var(--radius);padding:40px;box-shadow:var(--shadow-card);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:300px;">
          <div style="font-size:3rem;margin-bottom:20px;">&#128205;</div>
          <h3 style="font-family:var(--serif);font-size:1.3rem;color:var(--primary-deep);margin-bottom:8px;font-weight:400;">Encuéntranos</h3>
          <p style="color:var(--text-muted);font-size:0.92rem;margin-bottom:24px;">${config.mapDescription || ''}</p>
          <a href="${config.mapsUrl}" target="_blank" rel="noopener" class="btn-outline">Ver en Google Maps</a>
        </div>
      </div>
    </div>
  </section>`;

  fs.writeFileSync(path.join(redesignDir, 'contacto.html'), page(
    `Contacto — ${config.name}`,
    `Contacta con ${config.name}. ${config.phone}. ${config.address}.`,
    body
  ), 'utf-8');
}

// ─── GENERATE LEGAL PAGES ───
function generateLegalPages() {
  const legalData = config.legal || {};

  // Aviso Legal
  const avisoContent = legalData.avisoLegal || `
    <p><strong>Titular:</strong> ${legalData.titular || '[NOMBRE O RAZÓN SOCIAL]'}</p>
    <p><strong>NIF/CIF:</strong> ${legalData.nif || '[NIF/CIF]'}</p>
    <p><strong>Dirección:</strong> ${config.address}</p>
    <p><strong>Email:</strong> <a href="mailto:${config.email}">${config.email}</a></p>
    <p><strong>Teléfono:</strong> <a href="tel:${config.phone.replace(/\s/g, '')}">${config.phone}</a></p>
    ${legalData.colegiado ? `<p><strong>Número de colegiado:</strong> ${legalData.colegiado}</p>` : ''}
    ${legalData.registroMercantil ? `<p><strong>Datos registrales:</strong> ${legalData.registroMercantil}</p>` : ''}
    <h2>Objeto</h2>
    <p>El presente aviso legal regula el uso del sitio web <strong>${config.name}</strong>, del que es titular la persona/entidad arriba indicada.</p>
    <h2>Propiedad intelectual</h2>
    <p>Todos los contenidos de este sitio web (textos, imágenes, logotipos, diseño) son propiedad de ${legalData.titular || config.name} o de sus legítimos titulares, y están protegidos por las leyes de propiedad intelectual e industrial.</p>
    <h2>Responsabilidad</h2>
    <p>${legalData.titular || config.name} no se hace responsable del mal uso que se pueda hacer de los contenidos de esta web, siendo responsabilidad exclusiva de la persona que accede a ellos.</p>
    <h2>Legislación aplicable</h2>
    <p>Este aviso legal se rige por la normativa española vigente. Para la resolución de cualquier controversia, las partes se someten a los Juzgados y Tribunales de ${config.city}.</p>
  `;

  const avisoBody = `
  <section class="page-header">
    <div class="container">
      <div class="breadcrumb reveal"><a href="index.html">Inicio</a> / Aviso Legal</div>
      <h1 class="reveal reveal-delay-1">Aviso Legal</h1>
    </div>
  </section>
  <section class="content-section">
    <div class="container"><div class="content-body reveal">${avisoContent}</div></div>
  </section>`;

  fs.writeFileSync(path.join(redesignDir, 'aviso-legal.html'), page(
    `Aviso Legal — ${config.name}`, `Aviso legal de ${config.name}.`, avisoBody
  ), 'utf-8');

  // Política de Privacidad
  const privacidadContent = legalData.politicaPrivacidad || `
    <p>De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), le informamos:</p>
    <h2>Responsable del tratamiento</h2>
    <p><strong>${legalData.titular || '[NOMBRE O RAZÓN SOCIAL]'}</strong><br>
    NIF/CIF: ${legalData.nif || '[NIF/CIF]'}<br>
    Dirección: ${config.address.replace(/<br>/g, ', ')}<br>
    Email: <a href="mailto:${config.email}">${config.email}</a></p>
    <h2>Finalidad del tratamiento</h2>
    <p>Los datos personales recogidos a través de este sitio web se utilizarán para:</p>
    <ul>
      <li>Atender sus consultas y solicitudes de información</li>
      <li>Gestionar la prestación de nuestros servicios profesionales</li>
      <li>Enviarle comunicaciones relacionadas con nuestros servicios (si ha dado su consentimiento)</li>
    </ul>
    <h2>Base legal</h2>
    <p>El tratamiento de sus datos se basa en su consentimiento y/o en la ejecución de un contrato de prestación de servicios.</p>
    <h2>Destinatarios</h2>
    <p>Sus datos no serán cedidos a terceros salvo obligación legal.</p>
    <h2>Derechos del usuario</h2>
    <p>Puede ejercer sus derechos de acceso, rectificación, supresión, portabilidad, limitación y oposición enviando un email a <a href="mailto:${config.email}">${config.email}</a>.</p>
    <p>También tiene derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener">www.aepd.es</a>).</p>
    <h2>Conservación de datos</h2>
    <p>Sus datos se conservarán mientras sean necesarios para la finalidad para la que fueron recogidos y mientras no solicite su supresión.</p>
  `;

  const privacidadBody = `
  <section class="page-header">
    <div class="container">
      <div class="breadcrumb reveal"><a href="index.html">Inicio</a> / Política de Privacidad</div>
      <h1 class="reveal reveal-delay-1">Política de Privacidad</h1>
    </div>
  </section>
  <section class="content-section">
    <div class="container"><div class="content-body reveal">${privacidadContent}</div></div>
  </section>`;

  fs.writeFileSync(path.join(redesignDir, 'politica-privacidad.html'), page(
    `Política de Privacidad — ${config.name}`, `Política de privacidad de ${config.name}.`, privacidadBody
  ), 'utf-8');

  // Política de Cookies
  const cookiesContent = legalData.politicaCookies || `
    <p>Este sitio web utiliza cookies para mejorar su experiencia de navegación.</p>
    <h2>¿Qué son las cookies?</h2>
    <p>Las cookies son pequeños archivos de texto que se almacenan en su dispositivo cuando visita un sitio web. Permiten que el sitio recuerde sus acciones y preferencias.</p>
    <h2>Cookies que utilizamos</h2>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <thead>
        <tr style="border-bottom:2px solid var(--bg-dark);text-align:left;">
          <th style="padding:12px 8px;font-size:0.85rem;">Cookie</th>
          <th style="padding:12px 8px;font-size:0.85rem;">Tipo</th>
          <th style="padding:12px 8px;font-size:0.85rem;">Finalidad</th>
          <th style="padding:12px 8px;font-size:0.85rem;">Duración</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid var(--bg-dark);">
          <td style="padding:10px 8px;font-size:0.88rem;">cookie_consent</td>
          <td style="padding:10px 8px;font-size:0.88rem;">Técnica</td>
          <td style="padding:10px 8px;font-size:0.88rem;">Recordar su elección sobre cookies</td>
          <td style="padding:10px 8px;font-size:0.88rem;">1 año</td>
        </tr>
      </tbody>
    </table>
    <h2>¿Cómo gestionar las cookies?</h2>
    <p>Puede configurar su navegador para bloquear o eliminar las cookies. Tenga en cuenta que esto puede afectar al funcionamiento del sitio web.</p>
    <p>Para más información sobre cómo gestionar cookies en su navegador:</p>
    <ul>
      <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener">Google Chrome</a></li>
      <li><a href="https://support.mozilla.org/es/kb/cookies-informacion-que-los-sitios-web-guardan-en-" target="_blank" rel="noopener">Mozilla Firefox</a></li>
      <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener">Safari</a></li>
      <li><a href="https://support.microsoft.com/es-es/microsoft-edge/eliminar-las-cookies-en-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener">Microsoft Edge</a></li>
    </ul>
  `;

  const cookiesBody = `
  <section class="page-header">
    <div class="container">
      <div class="breadcrumb reveal"><a href="index.html">Inicio</a> / Política de Cookies</div>
      <h1 class="reveal reveal-delay-1">Política de Cookies</h1>
    </div>
  </section>
  <section class="content-section">
    <div class="container"><div class="content-body reveal">${cookiesContent}</div></div>
  </section>`;

  fs.writeFileSync(path.join(redesignDir, 'politica-cookies.html'), page(
    `Política de Cookies — ${config.name}`, `Política de cookies de ${config.name}.`, cookiesBody
  ), 'utf-8');
}

// ─── Add cookie banner + legal links to footer ───
// Patch: override getFooter to include legal links
const _origFooter = getFooter;
function getFooterWithLegal() {
  return `
  <footer class="footer">
    <div class="container">
      <div class="footer-inner">
        <div class="footer-logo">${config.logoText} <span>${config.logoTextItalic}</span></div>
        <ul class="footer-links">
          <li><a href="sobre-nosotros.html">Sobre nosotros</a></li>
          <li><a href="tratamientos.html">Tratamientos</a></li>
          <li><a href="blog.html">Blog</a></li>
          <li><a href="contacto.html">Contacto</a></li>
        </ul>
        ${config.socialLinks ? `<div style="display:flex;gap:12px;">${Object.entries(config.socialLinks).map(([net, url]) =>
          `<a href="${url}" target="_blank" rel="noopener" style="width:40px;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.6);font-size:0.8rem;">${net === 'facebook' ? 'f' : net === 'instagram' ? 'ig' : net === 'google_maps' ? '📍' : net[0].toUpperCase()}</a>`
        ).join('')}</div>` : ''}
      </div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:center;gap:24px;flex-wrap:wrap;">
        <a href="aviso-legal.html" style="color:rgba(255,255,255,0.4);font-size:0.78rem;">Aviso Legal</a>
        <a href="politica-privacidad.html" style="color:rgba(255,255,255,0.4);font-size:0.78rem;">Política de Privacidad</a>
        <a href="politica-cookies.html" style="color:rgba(255,255,255,0.4);font-size:0.78rem;">Política de Cookies</a>
      </div>
      <div class="footer-bottom">&copy; ${new Date().getFullYear()} ${config.name}. Todos los derechos reservados.</div>
    </div>
  </footer>
  <!-- Cookie Banner -->
  <div id="cookieBanner" style="position:fixed;bottom:0;left:0;right:0;background:rgba(28,42,45,0.97);backdrop-filter:blur(12px);color:#fff;padding:18px 28px;z-index:10000;display:none;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:0.88rem;box-shadow:0 -2px 20px rgba(0,0,0,0.15);">
    <p style="margin:0;max-width:700px;line-height:1.6;color:rgba(255,255,255,0.85);">Utilizamos cookies propias y de terceros para mejorar tu experiencia. <a href="politica-cookies.html" style="color:rgba(255,255,255,0.9);text-decoration:underline;">Más información</a></p>
    <div style="display:flex;gap:10px;flex-shrink:0;">
      <button onclick="document.getElementById('cookieBanner').style.display='none';localStorage.setItem('cookies_accepted','1')" style="background:#fff;color:#1C2A2D;border:none;padding:10px 24px;border-radius:100px;font-weight:600;font-size:0.85rem;cursor:pointer;">Aceptar</button>
      <button onclick="document.getElementById('cookieBanner').style.display='none';localStorage.setItem('cookies_accepted','0')" style="background:transparent;color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.2);padding:10px 24px;border-radius:100px;font-size:0.85rem;cursor:pointer;">Rechazar</button>
    </div>
  </div>
  <script>if(!localStorage.getItem('cookies_accepted')){document.getElementById('cookieBanner').style.display='flex';}</script>`;
}

// Replace footer function globally
// We can't reassign const, so we use this approach in the page() function
const originalPage = page;
page = function(title, description, bodyHTML, rootPath) {
  // Replace footer call with legal version
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <style>${getCSS()}</style>
</head>
<body>
  ${getNav(rootPath || '')}
  ${bodyHTML}
  ${getFooterWithLegal()}
  ${getJS()}
</body>
</html>`;
};

// ─── RUN ───
console.log(`\n═══ Generando sitio: ${config.name} ═══\n`);

// Home (already exists from frontend-design, skip if present)
const homeExists = fs.existsSync(path.join(redesignDir, 'index.html'));
if (homeExists) {
  console.log('   ✓ index.html (existente, no se sobreescribe)');
} else {
  console.log('   ⚠ index.html no existe — créala con /frontend-design');
}

// Treatments
console.log('\n── Tratamientos ──');
for (const t of config.treatments) {
  generateTreatment(t.slug);
  console.log(`   ✓ tratamientos/${t.slug}.html`);
}
generateTreatmentsIndex();
console.log('   ✓ tratamientos.html (índice)');

// Blog
console.log('\n── Blog ──');
for (const post of config.blogPosts) {
  generateBlogPost(post.slug);
  console.log(`   ✓ blog/${post.slug}.html`);
}
generateBlogIndex();
console.log('   ✓ blog.html (índice)');

// About
generateAbout();
console.log('\n── Páginas ──');
console.log('   ✓ sobre-nosotros.html');

// Contact
generateContact();
console.log('   ✓ contacto.html');

// Legal pages
generateLegalPages();
console.log('\n── Legal ──');
console.log('   ✓ aviso-legal.html');
console.log('   ✓ politica-privacidad.html');
console.log('   ✓ politica-cookies.html');
console.log('   ✓ Banner de cookies (incluido en todas las páginas)');

// Summary
const totalFiles = config.treatments.length + config.blogPosts.length + 7; // +7 for indexes + about + contact + 3 legal
console.log(`\n═══ ${totalFiles} páginas generadas en projects/${name}/redesign/ ═══\n`);
