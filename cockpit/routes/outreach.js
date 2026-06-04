// Outreach endpoints: preview never sends; send requires an explicit recipient
// and an explicit confirm flag from the UI, then logs into the pipeline.
//
// First contact resolves its A/B variant server-side (sticky per prospect,
// auto-balanced) and every send — first contact or follow-up, forced or not —
// is hard-blocked by the suppression list. "BAJA" has no override.

const { composeForProject } = require('../../outreach/compose');
const { sendEmail } = require('../../outreach/resend');
const { logOutreach } = require('../../outreach/log');
const { isSuppressed, addSuppression, removeSuppression, loadSuppressionList } = require('../../outreach/suppression');
const { resolveVariant, TEMPLATE_TO_VARIANT, FIRST_CONTACT_VARIANTS } = require('../../outreach/variants');
const { dueFollowUps, readyForFirstContact } = require('../../outreach/followups');
const { httpError } = require('../router');

// Resolve the (template, variant) pair for a request. First-contact-stage
// requests go through the A/B resolver; anything else passes through.
function resolveTemplate(projectId, requestedTemplate, requestedVariant) {
  const template = requestedTemplate || 'first-contact';
  if (!TEMPLATE_TO_VARIANT[template]) return { template, variant: null, sticky: false };
  if (requestedVariant && !FIRST_CONTACT_VARIANTS[requestedVariant]) {
    throw httpError(400, `Unknown variant "${requestedVariant}" (available: ${Object.keys(FIRST_CONTACT_VARIANTS).join(', ')})`);
  }
  const explicit = requestedVariant || (template !== 'first-contact' ? TEMPLATE_TO_VARIANT[template] : null);
  const { variant, sticky } = resolveVariant(projectId, explicit);
  return { template: FIRST_CONTACT_VARIANTS[variant], variant, sticky };
}

function preview({ body }) {
  if (!body || !body.projectId) throw httpError(400, 'Missing "projectId"');
  const { template, variant, sticky } = resolveTemplate(body.projectId, body.template, body.variant);
  const message = composeForProject(body.projectId, { template, to: body.to || null });
  if (message.to && isSuppressed(message.to)) {
    message.warnings.push(`${message.to} está en la lista de supresión (BAJA) — el envío está bloqueado`);
  }
  return { ...message, variant, sticky };
}

async function send({ body }) {
  if (!body || !body.projectId) throw httpError(400, 'Missing "projectId"');
  if (body.confirm !== true) throw httpError(400, 'Refusing to send without "confirm": true — preview first');

  const { template, variant } = resolveTemplate(body.projectId, body.template, body.variant);

  // Re-compose server-side; the UI may override subject/html/text after editing
  const message = composeForProject(body.projectId, { template, to: body.to || null });
  if (!message.to) throw httpError(400, 'No recipient email for this project');
  // Suppression is absolute: not even "force" overrides a BAJA
  if (isSuppressed(message.to)) {
    throw httpError(422, `${message.to} está en la lista de supresión (BAJA) — no se envía`);
  }
  if (message.warnings.length && !body.force) {
    throw httpError(400, `Unresolved warnings: ${message.warnings.join(' | ')}`);
  }

  const result = await sendEmail({
    to: message.to,
    subject: body.subject || message.subject,
    html: body.html || message.html,
    text: body.text || message.text,
  });
  if (!result.ok) {
    throw httpError(result.code === 'DOMAIN_UNVERIFIED' ? 422 : 502, result.message, { code: result.code, hint: result.hint });
  }
  await logOutreach(body.projectId, {
    to: message.to,
    subject: body.subject || message.subject,
    template: message.template,
    variant,
    messageId: result.messageId,
  });
  return { sent: true, messageId: result.messageId, to: message.to, variant };
}

function followups({ query }) {
  const days = parseInt(query.get('days'), 10);
  const max = parseInt(query.get('max'), 10);
  return dueFollowUps({
    days: Number.isFinite(days) ? days : 4,
    maxTouches: Number.isFinite(max) ? max : 3,
  });
}

function queue() {
  return readyForFirstContact();
}

function suppressionList() {
  return loadSuppressionList();
}

async function suppressionAdd({ body }) {
  if (!body || !body.email) throw httpError(400, 'Missing "email"');
  await addSuppression(body.email, body.reason || 'BAJA');
  return { suppressed: body.email };
}

async function suppressionRemove({ body }) {
  if (!body || !body.email) throw httpError(400, 'Missing "email"');
  await removeSuppression(body.email);
  return { removed: body.email };
}

module.exports = { preview, send, followups, queue, suppressionList, suppressionAdd, suppressionRemove };
