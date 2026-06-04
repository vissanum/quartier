// Root pages for the dedicated demos site (firebase deploy mode).
//
// Visual system: these pages wear the operator's SERVICE design language
// (the /webs landing's "paper + streetlight" system — Fraunces + Instrument
// Sans, warm paper, amber accent) so the demos site is unmistakably part of
// the same brand. Client demos themselves keep each client's own branding;
// only this chrome (root + 404) belongs to the operator.
//
// The site root must never list client demos — a prospect who trims their
// demo URL should land on the operator's service page, not on a directory
// of other businesses' demos. Both pages are noindex and self-contained.

// Where a stray visitor should end up: the operator's public service page.
// serviceUrl wins (e.g. a dedicated host whose root IS the landing); the
// classic <webBaseUrl>/webs layout is the fallback.
function landingUrl(config) {
  if (config.serviceUrl) return config.serviceUrl;
  const base = (config.deploy && config.deploy.webBaseUrl) || config.website || '';
  return base ? `${base}/webs` : '/';
}

// Shared chrome: the service design tokens and the brand header, byte-equal
// in spirit to the /webs pages so the two hosts read as one site.
function brandName(config) {
  return config.name || 'Demos';
}

function baseStyles() {
  return `
  :root {
    --papel: #faf6ef; --tinta: #221d16; --tinta-2: #5b5346; --tinta-3: #968b78;
    --farola: #d97d0d; --farola-oscura: #b5650a; --linea: rgba(34,29,22,.14);
    --display: 'Fraunces', Georgia, serif;
    --cuerpo: 'Instrument Sans', -apple-system, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--papel); color: var(--tinta); font-family: var(--cuerpo);
    font-size: 17px; line-height: 1.65; -webkit-font-smoothing: antialiased;
    min-height: 100vh; display: flex; flex-direction: column;
  }
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 1;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
  }
  .wrap { max-width: 1020px; margin: 0 auto; padding: 0 24px; position: relative; z-index: 2; width: 100%; }
  header { padding: 28px 0; }
  header .wrap { display: flex; align-items: baseline; justify-content: space-between; }
  .marca { font-family: var(--display); font-weight: 600; font-size: 19px; text-decoration: none; color: var(--tinta); }
  .marca em { font-style: normal; color: var(--farola); }
  .header-cta { font-size: 15px; font-weight: 500; text-decoration: none; color: var(--tinta); border-bottom: 2px solid var(--farola); padding-bottom: 1px; }
  .header-cta:hover { color: var(--farola-oscura); }
  main { flex: 1; display: grid; place-items: center; padding: 48px 0 80px; }
  a { color: inherit; }`;
}

function fontLinks() {
  // /favicon.svg resolves when the site (or the synced service pages)
  // ships one at the root; a missing favicon degrades silently.
  return `<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Instrument+Sans:wght@400;500&display=swap" rel="stylesheet">`;
}

function headerHtml(config) {
  const url = landingUrl(config);
  return `<header>
  <div class="wrap">
    <a class="marca" href="${url}">${brandName(config)}<em>.</em></a>
    <a class="header-cta" href="${url}">Ver el servicio →</a>
  </div>
</header>`;
}

// Site root: immediate hand-off to the service landing. Kept as a real page
// (not a hosting redirect) so the workspace stays plain static files — and
// dressed in the service system for the instant it is visible (or when a
// crawler/no-JS visitor lands on it).
function rootIndexHtml(config) {
  const url = landingUrl(config);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url=${url}">
<title>Demos — ${brandName(config)}</title>
${fontLinks()}
<style>${baseStyles()}
  .nota { max-width: 46ch; text-align: center; position: relative; z-index: 2; }
  .nota p { color: var(--tinta-2); margin-top: 10px; }
  .nota .titulo { font-family: var(--display); font-weight: 600; font-size: 24px; color: var(--tinta); }
</style>
<script>location.replace(${JSON.stringify(url)});</script>
</head>
<body>
${headerHtml(config)}
<main>
  <div class="nota">
    <div class="titulo">Las demos de este sitio son privadas<em style="font-style:normal;color:var(--farola)">.</em></div>
    <p>Cada una se comparte directamente con su negocio. Te llevamos al servicio: <a href="${url}">${url.replace(/^https?:\/\//, '')}</a></p>
  </div>
</main>
</body>
</html>
`;
}

// 404 in the service's visual language: a prospect following a stale or
// mistyped demo link gets a useful dead end that still feels like the brand.
function notFoundHtml(config) {
  const url = landingUrl(config);
  const operator = brandName(config);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Demo no encontrada — ${operator}</title>
${fontLinks()}
<style>${baseStyles()}
  .doc { max-width: 52ch; position: relative; z-index: 2; }
  .codigo {
    font-family: var(--display); font-weight: 700;
    font-size: clamp(64px, 14vw, 110px); line-height: 1; letter-spacing: -0.03em;
  }
  .codigo em { font-style: normal; color: var(--farola); }
  h1 {
    font-family: var(--display); font-weight: 600;
    font-size: clamp(22px, 4vw, 28px); letter-spacing: -0.01em; margin-top: 18px;
  }
  .doc p { margin-top: 12px; color: var(--tinta-2); }
  .acciones { margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--linea); }
  a.cta {
    color: var(--tinta); font-weight: 500; text-decoration: none;
    border-bottom: 2px solid var(--farola); padding-bottom: 1px;
  }
  a.cta:hover { color: var(--farola-oscura); }
</style>
</head>
<body>
${headerHtml(config)}
<main>
  <div class="doc">
    <div class="codigo">4<em>0</em>4</div>
    <h1>Esta demo no existe o ya no está publicada.</h1>
    <p>Las demos son borradores de trabajo: se publican para enseñarse y a veces se retiran. Si llegaste aquí desde un correo de ${operator}, responde a ese mismo correo y te paso el enlace bueno.</p>
    <div class="acciones">
      <a class="cta" href="${url}">Ver el servicio de páginas web →</a>
    </div>
  </div>
</main>
</body>
</html>
`;
}

module.exports = { rootIndexHtml, notFoundHtml, landingUrl };
