// Send email through the Resend REST API using native fetch — no SDK.
// Returns a structured result; never throws on API-level errors so callers
// can surface them in the UI.

const config = require('../lib/load-env');

async function sendEmail({ to, subject, html, text, from, replyTo }) {
  if (!config.resendApiKey) {
    return { ok: false, code: 'NO_API_KEY', message: 'RESEND_API_KEY is missing from .env' };
  }
  const sender = from || config.resend.from;
  if (!sender) {
    return { ok: false, code: 'NO_SENDER', message: 'resend.from is missing from config.operator.json' };
  }

  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        to: [to],
        reply_to: replyTo || config.resend.replyTo || undefined,
        subject,
        html,
        text,
      }),
    });
  } catch (err) {
    return { ok: false, code: 'NETWORK', message: err.message };
  }

  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, messageId: body.id };

  const message = body.message || `HTTP ${res.status}`;
  // Until the sending domain is verified, Resend only allows sends to the
  // account owner's own address. Treat that as a first-class state.
  if ((res.status === 403 || res.status === 422) && /not verified|verify a domain|own email|testing emails/i.test(message)) {
    return {
      ok: false,
      code: 'DOMAIN_UNVERIFIED',
      message,
      hint: 'Verify your domain in the Resend dashboard (SPF/DKIM DNS records). Until then you can only send to your own address.',
    };
  }
  return { ok: false, code: 'SEND_FAILED', status: res.status, message };
}

module.exports = { sendEmail };
