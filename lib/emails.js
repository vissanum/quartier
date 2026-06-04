// Extract business contact emails from HTML. Used by prospect/fetch.js,
// scraper/scrape-site.js and prospect/enrich-emails.js.

// Patterns that are never a business contact address
const JUNK = [
  /@(example|sentry|wixpress|cloudflare|googlemail-smtp)\./i,
  /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?)$/i, // asset names like icon@2x.png
  /^(noreply|no-reply|donotreply|mailer-daemon)@/i,
  /^[0-9a-f]{16,}@/i, // hashed/tracking addresses
];

function isPlausible(email) {
  if (email.length > 80) return false;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
  return !JUNK.some((re) => re.test(email));
}

// Returns unique addresses, best candidate first: mailto: links weigh more
// than raw text matches, and addresses on the site's own domain win.
function extractEmails(html, baseUrl = '') {
  const scores = new Map();
  const add = (raw, weight) => {
    const email = raw.trim().toLowerCase().replace(/^mailto:/, '');
    if (!isPlausible(email)) return;
    scores.set(email, (scores.get(email) || 0) + weight);
  };

  for (const m of html.matchAll(/href=["']mailto:([^"'?]+)/gi)) {
    add(decodeURIComponent(m[1]), 10);
  }
  for (const m of html.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    add(m[0], 1);
  }

  let host = '';
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, '');
  } catch { /* no base URL — skip domain affinity */ }

  return [...scores.entries()]
    .map(([email, score]) => {
      const domain = email.split('@')[1];
      return { email, score: score + (host && (domain === host || domain.endsWith('.' + host)) ? 20 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .map((e) => e.email);
}

module.exports = { extractEmails, isPlausible };
