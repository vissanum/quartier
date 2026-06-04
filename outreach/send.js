#!/usr/bin/env node
// Compose and send an outreach email for a pipeline project.
//
// Default is preview-only — nothing is sent without the explicit --send flag,
// so no email ever leaves without the operator having seen it.
//
// First contact runs as an A/B experiment between two pitches (design doc
// 2026-06-04): variant a = teardown ("antes/después"), variant b = demo-first
// ("ya está hecha"). Assignment is sticky per prospect and auto-balanced
// across the pipeline unless forced with --variant.
//
// Usage:
//   node outreach/send.js <project-id>                         # preview first contact (auto variant)
//   node outreach/send.js <project-id> --variant b             # force the demo-first pitch
//   node outreach/send.js <project-id> --template follow-up    # preview follow-up
//   node outreach/send.js <project-id> --to someone@example.com
//   node outreach/send.js <project-id> --send                  # actually send

const { composeForProject } = require('./compose');
const { sendEmail } = require('./resend');
const { logOutreach } = require('./log');
const { isSuppressed } = require('./suppression');
const { resolveVariant, TEMPLATE_TO_VARIANT, FIRST_CONTACT_VARIANTS } = require('./variants');

function getFlag(args, name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const projectId = args.find((a) => !a.startsWith('--') && a !== getFlag(args, '--template') && a !== getFlag(args, '--to') && a !== getFlag(args, '--variant'));
  if (!projectId) {
    console.error('Usage: node outreach/send.js <project-id> [--template first-contact|follow-up] [--variant a|b] [--to email] [--send]');
    process.exit(1);
  }

  const requestedTemplate = getFlag(args, '--template') || 'first-contact';
  const explicitVariant = (getFlag(args, '--variant') || '').toLowerCase() || null;
  if (explicitVariant && !FIRST_CONTACT_VARIANTS[explicitVariant]) {
    console.error(`Unknown variant "${explicitVariant}" (available: ${Object.keys(FIRST_CONTACT_VARIANTS).join(', ')})`);
    process.exit(1);
  }

  // First-contact stage → resolve the A/B variant; other templates pass through.
  let template = requestedTemplate;
  let variant = null;
  let sticky = false;
  if (TEMPLATE_TO_VARIANT[requestedTemplate]) {
    const explicit = explicitVariant || (requestedTemplate !== 'first-contact' ? TEMPLATE_TO_VARIANT[requestedTemplate] : null);
    ({ variant, sticky } = resolveVariant(projectId, explicit));
    template = FIRST_CONTACT_VARIANTS[variant];
  }

  const message = composeForProject(projectId, {
    template,
    to: getFlag(args, '--to'),
  });

  // Suppression gate: a "BAJA" reply means we never write again — not for
  // first contacts, not for follow-ups, not via --to overrides.
  if (message.to && isSuppressed(message.to)) {
    message.warnings.push(`${message.to} está en la lista de supresión (BAJA) — el envío está bloqueado`);
  }

  const variantLabel = variant ? `, variant ${variant}${sticky ? ' (sticky)' : ''}` : '';
  console.log(`─── Outreach preview: ${projectId} (${message.template}${variantLabel}) ───`);
  console.log(`To:      ${message.to || '(none)'}`);
  console.log(`Subject: ${message.subject}`);
  console.log('');
  console.log(message.text);
  console.log('');
  for (const w of message.warnings) console.warn(`⚠ ${w}`);

  if (!args.includes('--send')) {
    console.log('\n(Preview only — pass --send to actually send)');
    return;
  }
  if (message.warnings.length) {
    console.error('\n✗ Not sending: resolve the warnings above first.');
    process.exit(1);
  }

  const result = await sendEmail(message);
  if (!result.ok) {
    console.error(`\n✗ Send failed [${result.code}]: ${result.message}`);
    if (result.hint) console.error(`  Hint: ${result.hint}`);
    process.exit(1);
  }
  await logOutreach(projectId, { to: message.to, subject: message.subject, template: message.template, variant, messageId: result.messageId });
  console.log(`\n✓ Sent (messageId: ${result.messageId}) — logged to pipeline.json`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
