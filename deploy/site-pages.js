// Root pages for the dedicated demos site (firebase deploy mode).
//
// The site root must never list client demos — a prospect who trims their
// demo URL should land on the operator's service page, not on a directory
// of other businesses' demos. Both pages are noindex and self-contained.

// Where a stray visitor should end up: the operator's public service page.
function landingUrl(config) {
  const base = (config.deploy && config.deploy.webBaseUrl) || config.website || '';
  return base ? `${base}/webs` : '/';
}

// Site root: immediate hand-off to the service landing. Kept as a real page
// (not a hosting redirect) so the workspace stays plain static files.
function rootIndexHtml(config) {
  const url = landingUrl(config);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url=${url}">
<title>Demos — redirigiendo</title>
<script>location.replace(${JSON.stringify(url)});</script>
</head>
<body>
<p>Las demos de este sitio son privadas. Te llevamos a <a href="${url}">${url.replace(/^https?:\/\//, '')}</a>…</p>
</body>
</html>
`;
}

// 404 in the service's visual language (paper + streetlight palette): a
// prospect following a stale or mistyped demo link gets a useful dead end.
function notFoundHtml(config) {
  const url = landingUrl(config);
  const operator = config.name || '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Demo no encontrada</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Instrument+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --papel: #faf6ef; --tinta: #221d16; --tinta-2: #5b5346; --tinta-3: #968b78;
    --farola: #d97d0d; --farola-oscura: #b5650a; --linea: rgba(34,29,22,.14);
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--papel); color: var(--tinta);
    font-family: 'Instrument Sans', -apple-system, sans-serif;
    font-size: 17px; line-height: 1.65; -webkit-font-smoothing: antialiased;
    min-height: 100vh; display: grid; place-items: center; padding: 24px;
  }
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
  }
  main { max-width: 52ch; position: relative; }
  .codigo {
    font-family: 'Fraunces', Georgia, serif; font-weight: 700;
    font-size: clamp(64px, 14vw, 110px); line-height: 1; letter-spacing: -0.03em;
  }
  .codigo em { font-style: normal; color: var(--farola); }
  h1 {
    font-family: 'Fraunces', Georgia, serif; font-weight: 600;
    font-size: clamp(22px, 4vw, 28px); letter-spacing: -0.01em; margin-top: 18px;
  }
  p { margin-top: 12px; color: var(--tinta-2); }
  .acciones { margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--linea); }
  a.cta {
    color: var(--tinta); font-weight: 500; text-decoration: none;
    border-bottom: 2px solid var(--farola); padding-bottom: 1px;
  }
  a.cta:hover { color: var(--farola-oscura); }
  .firma { margin-top: 10px; font-size: 14px; color: var(--tinta-3); }
</style>
</head>
<body>
<main>
  <div class="codigo">4<em>0</em>4</div>
  <h1>Esta demo no existe o ya no está publicada.</h1>
  <p>Las demos son borradores de trabajo: se publican para enseñarse y a veces se retiran. Si llegaste aquí desde un correo${operator ? ` de ${operator}` : ''}, responde a ese mismo correo y te paso el enlace bueno.</p>
  <div class="acciones">
    <a class="cta" href="${url}">Ver el servicio de páginas web →</a>
    ${operator ? `<p class="firma">${operator}</p>` : ''}
  </div>
</main>
</body>
</html>
`;
}

module.exports = { rootIndexHtml, notFoundHtml, landingUrl };
