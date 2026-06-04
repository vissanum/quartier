// Email templates for client outreach. Every template returns
// { subject, html, text } and always includes the LSSI compliance block
// (sender identification + opt-out) required for commercial email in Spain.

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function lssiText(operator) {
  return [
    '--',
    `Este mensaje es una comunicación comercial de ${operator.name} (${operator.website}).`,
    `Contacto: ${operator.resend.replyTo || operator.email}.`,
    'Si no deseas recibir más correos, responde con "BAJA" y no volveremos a escribirte.',
  ].join('\n');
}

function lssiHtml(operator) {
  return `
  <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e2e4ea;font-size:12px;line-height:1.5;color:#8a8fa3;">
    Este mensaje es una comunicación comercial de ${escapeHtml(operator.name)}
    (<a href="${escapeHtml(operator.website)}" style="color:#8a8fa3;">${escapeHtml(operator.website.replace(/^https?:\/\//, ''))}</a>).
    Contacto: ${escapeHtml(operator.resend.replyTo || operator.email)}.
    Si no deseas recibir más correos, responde con &quot;BAJA&quot; y no volveremos a escribirte.
  </p>`;
}

function wrapHtml(operator, paragraphsHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f6f7f9;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a2e;">
    ${paragraphsHtml}
    ${lssiHtml(operator)}
  </div>
</body>
</html>`;
}

function signatureText(operator) {
  return `Un saludo,\n${operator.name}\n${operator.website}`;
}

function signatureHtml(operator) {
  return `<p style="margin:24px 0 0;">Un saludo,<br>
    <strong>${escapeHtml(operator.name)}</strong><br>
    <a href="${escapeHtml(operator.website)}" style="color:#2563eb;">${escapeHtml(operator.website.replace(/^https?:\/\//, ''))}</a></p>`;
}

// ctx: { entry (pipeline), operator (load-env config), publicUrl }
function buildFirstContact(ctx) {
  const { entry, operator, publicUrl } = ctx;
  const nombre = entry.nombre;
  const ciudad = entry.ciudad || '';

  const subject = `He preparado un rediseño de la web de ${nombre}`;

  const text = `Hola,

Soy ${operator.name}, desarrollador web${ciudad ? ` en ${ciudad}` : ''}. He visitado la web de ${nombre} y he preparado, por iniciativa propia y sin ningún compromiso, una propuesta de cómo podría verse con un diseño actual.

Podéis ver la comparación antes/después aquí:
${publicUrl}

Es una demo real: se puede navegar y ver en el móvil. Si os interesa, respondedme a este correo y hablamos de los detalles (precio cerrado, sin sorpresas). Y si no, también podéis decírmelo y no os escribo más.

${signatureText(operator)}

${lssiText(operator)}`;

  const html = wrapHtml(operator, `
    <p style="margin:0 0 16px;">Hola,</p>
    <p style="margin:0 0 16px;">Soy <strong>${escapeHtml(operator.name)}</strong>, desarrollador web${ciudad ? ` en ${escapeHtml(ciudad)}` : ''}.
      He visitado la web de <strong>${escapeHtml(nombre)}</strong> y he preparado, por iniciativa propia y
      sin ningún compromiso, una propuesta de cómo podría verse con un diseño actual.</p>
    <p style="margin:0 0 24px;">Es una demo real: se puede navegar y ver en el móvil.</p>
    <p style="margin:0 0 24px;text-align:center;">
      <a href="${escapeHtml(publicUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;">Ver el antes y después</a>
    </p>
    <p style="margin:0 0 16px;">Si os interesa, respondedme a este correo y hablamos de los detalles
      (precio cerrado, sin sorpresas). Y si no, también podéis decírmelo y no os escribo más.</p>
    ${signatureHtml(operator)}`);

  return { subject, html, text };
}

// Variant B of the first contact: demo-first pitch ("it's already built —
// look") instead of the teardown/before-after frame of buildFirstContact.
// Decided in the 2026-06-04 design doc: the A/B between the two frames is
// the platform's first experiment. Keep buildFirstContact byte-stable as
// the control. Works both for redesign candidates (entry.url present) and
// businesses with no website at all.
function buildFirstContactDemoFirst(ctx) {
  const { entry, operator, publicUrl } = ctx;
  const nombre = entry.nombre;
  const ciudad = entry.ciudad || '';
  const tieneWeb = Boolean(entry.url && String(entry.url).trim());

  const subject = `La nueva web de ${nombre} ya está hecha`;

  const situacionText = tieneWeb
    ? `He construido, por iniciativa propia y sin ningún compromiso, una versión nueva de la web de ${nombre}: diseño actual, rápida y pensada para el móvil.`
    : `Al buscar ${nombre} en Google no aparece una web propia, así que he construido una, por iniciativa propia y sin ningún compromiso.`;

  const text = `Hola,

Soy ${operator.name}, desarrollador web${ciudad ? ` en ${ciudad}` : ''}. Esto no es una propuesta de proyecto: la web ya está hecha.

${situacionText}

Podéis verla aquí, tal y como la verían vuestros clientes:
${publicUrl}

Cuando alguien os recomienda, lo primero que hace es buscaros en Google. Lo que encuentra decide si os llama.

Si os gusta, es vuestra: respondedme a este correo y la dejamos lista con vuestro dominio (precio cerrado, sin sorpresas). Y si no, decídmelo y no os escribo más.

${signatureText(operator)}

${lssiText(operator)}`;

  const situacionHtml = tieneWeb
    ? `He construido, por iniciativa propia y sin ningún compromiso, una versión nueva de la web de
      <strong>${escapeHtml(nombre)}</strong>: diseño actual, rápida y pensada para el móvil.`
    : `Al buscar <strong>${escapeHtml(nombre)}</strong> en Google no aparece una web propia, así que
      he construido una, por iniciativa propia y sin ningún compromiso.`;

  const html = wrapHtml(operator, `
    <p style="margin:0 0 16px;">Hola,</p>
    <p style="margin:0 0 16px;">Soy <strong>${escapeHtml(operator.name)}</strong>, desarrollador web${ciudad ? ` en ${escapeHtml(ciudad)}` : ''}.
      Esto no es una propuesta de proyecto: <strong>la web ya está hecha</strong>.</p>
    <p style="margin:0 0 16px;">${situacionHtml}</p>
    <p style="margin:0 0 24px;">Podéis verla aquí, tal y como la verían vuestros clientes:</p>
    <p style="margin:0 0 24px;text-align:center;">
      <a href="${escapeHtml(publicUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;">Ver la web terminada</a>
    </p>
    <p style="margin:0 0 16px;">Cuando alguien os recomienda, lo primero que hace es buscaros en Google.
      Lo que encuentra decide si os llama.</p>
    <p style="margin:0 0 16px;">Si os gusta, es vuestra: respondedme a este correo y la dejamos lista con
      vuestro dominio (precio cerrado, sin sorpresas). Y si no, decídmelo y no os escribo más.</p>
    ${signatureHtml(operator)}`);

  return { subject, html, text };
}

// ctx additionally uses entry.outreach[] for the prior contact date
function buildFollowUp(ctx) {
  const { entry, operator, publicUrl } = ctx;
  const nombre = entry.nombre;
  const last = (entry.outreach || []).slice(-1)[0];
  const cuando = last ? `el ${new Date(last.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : 'hace unos días';

  const subject = `¿Visteis la propuesta de web para ${nombre}?`;

  const text = `Hola,

Os escribí ${cuando} con una propuesta de rediseño para la web de ${nombre}. Sé que estos correos se quedan enterrados en la bandeja de entrada, así que os reenvío el enlace por si os interesa echarle un vistazo:

${publicUrl}

Cualquier duda, respondedme a este correo. Y si preferís que no os escriba más, un "BAJA" y listo.

${signatureText(operator)}

${lssiText(operator)}`;

  const html = wrapHtml(operator, `
    <p style="margin:0 0 16px;">Hola,</p>
    <p style="margin:0 0 16px;">Os escribí ${escapeHtml(cuando)} con una propuesta de rediseño para la web de
      <strong>${escapeHtml(nombre)}</strong>. Sé que estos correos se quedan enterrados en la bandeja de
      entrada, así que os reenvío el enlace por si os interesa echarle un vistazo.</p>
    <p style="margin:0 0 24px;text-align:center;">
      <a href="${escapeHtml(publicUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;">Ver la propuesta</a>
    </p>
    <p style="margin:0 0 16px;">Cualquier duda, respondedme a este correo. Y si preferís que no os escriba más, un &quot;BAJA&quot; y listo.</p>
    ${signatureHtml(operator)}`);

  return { subject, html, text };
}

const TEMPLATES = {
  'first-contact': buildFirstContact,
  'first-contact-demo': buildFirstContactDemoFirst,
  'follow-up': buildFollowUp,
};

// First-contact A/B experiment: variant key → template name.
// A = teardown control (before/after), B = demo-first ("ya está hecha").
const FIRST_CONTACT_VARIANTS = {
  a: 'first-contact',
  b: 'first-contact-demo',
};

module.exports = { buildFirstContact, buildFirstContactDemoFirst, buildFollowUp, TEMPLATES, FIRST_CONTACT_VARIANTS };
