# Quartier — Playbook

Instructions for the AI agent. Read this before doing anything.

## What is this

Toolkit for finding local businesses that need a website (or a redesign) and building modern websites for them. The user talks, the AI agent runs scripts and makes decisions.

All scripts run inside Docker via `./run.sh`:

```bash
./run.sh node prospect/search.js "Kreuzberg, Berlin"
```

## Scripts

### Prospecting
| Command | What it does |
|---------|-------------|
| `./run.sh node prospect/search.js "<area>"` | Search Google Maps for businesses |
| `./run.sh node prospect/search.js "<type>" "<area>"` | Search specific business type |
| `./run.sh node prospect/search.js "<area>" --dry-run` | Preview without API calls |
| `./run.sh node prospect/fetch.js <url>` | Download and analyze a website |
| `./run.sh node prospect/fetch.js <url> --screenshot` | Also capture screenshots |
| `./run.sh bash prospect/analyze.sh` | Full analysis with Lighthouse (Docker) |
| `./run.sh bash prospect/analyze.sh --limit 5` | Analyze first 5 only |
| `./run.sh node prospect/serve.js` | Local UI at http://localhost:3457 |

### Redesign
| Command | What it does |
|---------|-------------|
| `./run.sh node scraper/scrape-site.js <url> <name>` | Download full site |
| `./run.sh node scraper/scrape-home.js <url> <name>` | Download homepage only |
| `./run.sh node scraper/google-places.js "<business>" "<city>" <name>` | Get reviews + photos |
| `./run.sh node generate/site.js <name>` | Generate redesign from config |
| `./run.sh ./tools/optimize-images.sh <assets-dir> [--webp]` | Optimize images |
| `./run.sh bash tools/validate-html.sh <directory>` | Validate HTML |

### Sell (run on the HOST, not in Docker)
| Command | What it does |
|---------|-------------|
| `node cockpit/server.js` | Unified local UI at http://localhost:3458 (pipeline, prospects, jobs, deploy, outreach, follow-ups, suppression) |
| `node prospect/enrich-emails.js --pending` | Find business emails on prospects' websites |
| `node deploy/publish.js <name> [--no-push]` | Publish demo to the public website repo (git push → CI deploys) |
| `node outreach/send.js <name> [--variant a\|b] [--send]` | Compose outreach email (preview by default; `--send` requires RESEND_API_KEY) |
| `node outreach/followups.js [--days 4] [--max 3]` | List prospects due a follow-up touch (read-only) |
| `node outreach/suppression.js add\|remove\|list <email>` | Manage the "BAJA" suppression list |
| `node tools/preview.js <dir> [port]` | Static preview server with live reload |
| `node tools/reset-data.js [--yes]` | Clean slate: wipe projects/prospects sample data (dry-run by default; never touches config, suppression list or the public repo) |

Deploy/outreach config lives in `config.operator.json` (`deploy.repoPath`, `resend.from`, `tracking`…) and `.env` (`RESEND_API_KEY`).

---

## Prospecting flow

The user names an area (e.g. "search in Kreuzberg"). The agent runs the scripts and makes the decisions.

### 1. Search businesses

```bash
./run.sh node prospect/search.js "Kreuzberg, Berlin"
```

Searches Google Maps for all business types in `prospects/config.json`. Saves raw results to `prospects/prospects.json`.

### 2. Evaluate results

Read `prospects.json` and decide:
- **Is it a real local business?** Discard chains, franchises, services that don't need a website.
- **Does it have a website?** Separate into "needs new site" vs "redesign candidate".
- **Is it worth pursuing?** Consider business type, activity, rating.

### 3. Evaluate websites

For candidates with a website:

```bash
./run.sh node prospect/fetch.js <url>
```

Downloads HTML and extracts technical info (responsive, CMS, HTTPS, etc.). Read the result and judge if the website needs a redesign.

### 4. Present candidates

Present the best candidates to the user, organized by:
- **No website** — new site candidates
- **Bad website** — redesign candidates

The user approves or rejects each one.

### 5. Pipeline

Approved candidates go to `projects/pipeline.json`.

### API costs

- Places API (New) Text Search — **5,000 free calls/month**
- Typical neighborhood search: ~40 calls
- Requires `GOOGLE_PLACES_API_KEY` in `.env`

---

## Redesign flow

When the user gives a URL to redesign, follow these steps in order.

### 1. Download the full site

```bash
./run.sh node scraper/scrape-site.js <url> <project-name>
```

Downloads ALL subpages and generates:
- `projects/<name>/original/sitemap.json` — full sitemap with page content
- `projects/<name>/original/pages/` — HTML of each subpage
- `projects/<name>/original/assets/` — all images
- Desktop + mobile screenshots

### 2. Analyze

Read `sitemap.json`, HTML, images and screenshots. Extract:

**Business**: name, type, description, tagline.

**Branding (CRITICAL)**:
- **Logo**: find in downloaded assets (usually first img or one with "logo" in name/alt). Read the logo image visually.
- **Colors**: extract main colors from original CSS — variables, header/nav backgrounds, button colors, heading colors.
- **The redesign MUST use the original branding colors** adapted to a modern design. Don't invent new colors.
- **Fonts**: which Google Fonts or other typefaces.

**Content**: services/products with full descriptions, all blog articles (complete text), about/team pages, main section copy.

**Contact**: phone, email, address, hours, Google Maps (link or embed), ALL social media links.

**Forms**: check if the original has contact/booking/quote forms. Replicate them (with `mailto:` if no backend). If no form but it makes sense, consider adding one.

**Google Places data**:

```bash
./run.sh node scraper/google-places.js "<business name>" "<city>" <project-name>
```

Downloads ratings, reviews and photos. Use the results:
- Rating >= 4.0 → show prominently as social proof
- Rating < 4.0 or none → don't show
- Good 4-5 star reviews → add testimonials section with real names
- Quality photos → use in redesign (real photos > AI generated)

**Legal pages**: check for existing privacy policy, legal notice, cookie policy. Extract content.

**Problems found**: not responsive, no SEO, outdated design, broken images, no HTTPS, slow, etc.

### 3. Create config.json

Create `projects/<name>/config.json` with all extracted info. This feeds the generator.

### 4. Images

1. Review downloaded images (`original/assets/`). Reuse good ones in `redesign/assets/`.
2. Use any photos from the user.
3. Use Google Maps photos if available.
4. Generate missing images with AI if the model supports it, or ask the user.

Save in `projects/<name>/redesign/assets/`.

### Design quality bar (applies to EVERY generated page)

The full implementation of this bar is the `/business-web-design` skill
(`.claude/skills/business-web-design/`): follow its workflow (design-lock before code,
banned-tells list, booking pattern for appointment trades) and run its
`scripts/verify_design.py` until 0 FAILs before showing any page. The rules below are
the summary; the skill is the source of truth.

The redesign must look hand-crafted for this business, not AI-generated. Hard rules:

- **No emojis as icons.** Use inline SVG icons or none. Emoji service grids scream "AI template".
- **Real photos beat everything**: original site assets > Google Places photos > nothing. AI-generated images only as a last resort, and never for people or food.
- **Typography with character**: pick ONE distinctive display font that fits the trade (a barbershop ≠ a law firm) paired with a quiet body font. Never Inter/Roboto/Arial/system-only. Vary fonts across projects — two clients must never receive the same-looking site.
- **The business's own colors**, deepened — never invent a palette, never default to purple gradients or generic blue.
- **No filler copy**: every sentence must come from the original content, reviews, or verifiable facts. No "soluciones integrales", no generic mission statements.
- **Hierarchy you can squint at**: one clear primary action per page (call, book, visit). If everything is bold, nothing is.
- **Animations must degrade**: reveal-on-scroll and friends need ALL THREE
  fallbacks — `.js`-gated styles (no JS → fully visible), a reveal-all
  timeout failsafe (~2.5s), and a `prefers-reduced-motion` media query
  (visible without animation). A demo that renders blank for any visitor
  is worse than no animation at all.
- **Specific beats generic**: real opening hours over "always available", real street name in the hero over "your trusted partner".

Before showing the user, ask: would another AI given the same config produce this exact page? If yes, it's not done.

### 5. Create the HOME redesign

Generate a complete, modern, responsive home page with all the business info. Requirements:
- Standalone HTML with inline CSS
- Mobile-first, responsive
- `noindex, nofollow` meta tag (it's a demo)
- Original branding colors and logo
- Full structure: hero + CTA, services, testimonials, contact, Google Maps embed, footer
- All social media links
- Internal links to subpages (relative paths for local review)
- Operator info in footer (read from `config.operator.json`)

Save as `projects/<name>/redesign/index.html`.

### 6. Create ALL subpages

**IMPORTANT**: The redesign includes the FULL site, not just the home. Check `sitemap.json` and recreate every page from the original:

- Service/treatment pages (with complete content)
- Blog articles (full text, don't summarize)
- About / team
- Contact
- Regulations / rules (include PDFs if any)
- Image galleries
- Any other page the original has

Each subpage must:
- Match the home style (same colors, fonts, nav, footer)
- Have ALL content from the original (don't cut or summarize)
- Include downloaded images

Save in `projects/<name>/redesign/`.

### 7. Legal pages

Evaluate what the project needs. Don't add everything by default.

Templates in `templates/` (Spanish law — adapt to local regulations):

**Always**: Legal notice (`aviso-legal.html`)

**Only if collecting personal data** (contact form, etc.): Privacy policy (`politica-privacidad.html`)

**Only if using cookies/analytics**: Cookie policy (`politica-cookies.html`) + cookie banner

Use `[FILL IN]` placeholders for missing legal data (business name, tax ID, etc.). Warn the user before deploying if any remain.

### 8. Optimize images

```bash
./run.sh ./tools/optimize-images.sh projects/<name>/redesign/assets
./run.sh ./tools/optimize-images.sh projects/<name>/redesign/assets --webp
```

### 9. Showcase (only for redesigns, not new sites)

Generate `projects/<name>/showcase.html` — before/after page for the client:
- Visual comparison: original screenshot vs redesign preview
- Problems found vs improvements made
- Button to view the live redesign
- Operator contact info (from `config.operator.json`)

### 10. Validate HTML

**Run ALWAYS before showing to the user:**

```bash
./run.sh bash tools/validate-html.sh projects/<name>/redesign
```

Fix errors before continuing. Warnings can be ignored if minor.

### 11. Local review

Open `projects/<name>/redesign/index.html` in the browser. All paths are relative.

Tell the user the page is ready for review. **DO NOT deploy. Wait for user approval.**

### 12. Deploy (only when user asks)

```bash
node deploy/publish.js <name>            # build + deliver
node deploy/publish.js <name> --no-push  # build only, inspect first
```

Runs on the HOST. The build is always the same (showcase → index.html,
redesign/ → demo/, paths rewritten, integrity-scanned, `noindex` enforced,
tracking injected, public URL recorded in `pipeline.json`). Delivery depends
on `deploy.mode` in `config.operator.json`:

- **`"firebase"` — dedicated Hosting site (recommended).** Copies into a
  local workspace (`deploy/site/`, gitignored — it holds the whole site) and
  releases it with `firebase deploy`. Live in seconds, no git round-trip,
  no CI. One-time setup:
  1. `firebase hosting:sites:create <site-id> --project <gcp-project>`
  2. Point a subdomain at it (CNAME → `<site-id>.web.app`; register the
     custom domain in Firebase Hosting so it mints the SSL cert).
  3. Fill `deploy.firebase` (`project`, `site`, `baseUrl`) and set
     `deploy.mode` to `"firebase"`.
  Two layouts:
  - **Demos-only** (defaults): demos at the site root,
    `<baseUrl>/<slug>`. The root `index.html` hands off to the service
    landing (never lists demos — client privacy) and a crafted `404.html`
    covers stale links; both generate on first deploy and are kept if you
    customize them.
  - **Unified service + demos**: set `firebase.serviceDir` (a folder in the
    deploy repo, e.g. `"public-webs"`) and `firebase.demosPath` (e.g.
    `"demos"`). Every publish syncs the service pages from the deploy
    repo's LAST COMMIT (never the working tree — half-edited pages can't
    leak) to the site root and writes demos under `/<demosPath>/<slug>`.
    Demo URL: `<baseUrl>/<demosPath>/<slug>`. Demos get an `X-Robots-Tag:
    noindex` header; service pages stay indexable. To publish a service
    change without touching demos: commit it in the deploy repo, then
    re-publish any project.
  Set top-level `serviceUrl` so toolkit chrome (404, hand-off page) links
  to your service page (defaults to `<webBaseUrl>/webs`).

- **`"git"` (default)** — copies into `<deploy.repoPath>/public/webs/<name>/`,
  commits and pushes; the website repo's CI deploys it (needs git + SSH keys).
  Demo URL: `<webBaseUrl>/webs/<slug>`. Use when you'd rather keep demos
  versioned inside the website repo and don't mind the CI wait.

Notes:
- **Reserved slugs:** `index` and `assets` are always refused as project
  names (`404` too on the demos site). In git mode, list your own /webs pages
  (landing, intake form, privacy policy) in `deploy.reservedSlugs` so a
  project can never shadow them.
- **Visit tracking:** if `config.operator.json` has a `tracking` block
  (`{"provider":"goatcounter","goatcounter":{"code":"..."}}` or
  `{"provider":"beacon","endpoint":"https://..."}`), publish.js injects the
  snippet into every published page so you can tell whether a prospect opened
  their demo. No tracking block → pages publish untouched.

---

## Outreach flow

The sales loop. Demand thesis: the pitch is the RESULT of automation — the
demo arrives already built, so the prospect's effort to see value is zero.

### First contact: A/B pitch experiment

Two first-contact templates exist in `outreach/templates.js`:

- **Variant A — `first-contact` (teardown):** "he preparado un rediseño,
  mira el antes y después". The control.
- **Variant B — `first-contact-demo` (demo-first):** "la web ya está hecha,
  mírala" + the credibility hook ("cuando te recomiendan y te googlean, lo que
  encuentran decide si te llaman"). Adapts copy for prospects with no website.

Assignment rules (`outreach/variants.js`, shared by CLI and cockpit):
1. **Sticky:** a prospect that already received a variant keeps it forever.
2. **Explicit:** `--variant a|b` (CLI) or the A/B chips (cockpit) force one.
3. **Auto-balance:** otherwise the variant with fewer sends wins (tie → A).

Every send records `variant` in the pipeline entry's `outreach[]` log. Compare
replies and demo visits per variant before declaring a winning pitch — with
batches of 20-30 the result is directional, not significant.

### Suppression list ("BAJA" is forever)

`outreach/suppression.json` holds every address that asked to stop.
`send.js` and the cockpit check it BEFORE every send — first contact and
follow-ups alike, no force override. A reply containing "BAJA" must be added
immediately: `node outreach/suppression.js add <email>`. The list survives
`tools/reset-data.js` on purpose (legal record).

### Follow-ups (>50% of replies live here)

A prospect is due a follow-up when: fase is `contactado` AND last touch ≥4
days ago AND fewer than 3 total touches AND not suppressed. A reply moves the
entry forward in the pipeline (or to `descartado`), which drops it off the
due list automatically. Sending any email auto-advances `prospecto` →
`contactado` — no manual phase bump needed.

### Cockpit operator loop (http://localhost:3458)

The pipeline view's top bar is the morning checklist:
- **Seguimientos pendientes** — prospects due a follow-up touch, one click
  opens the composer with the follow-up template.
- **Cola 1er contacto** — prospects ready for their first touch (fase
  `prospecto` + email + live demo + not suppressed).
- **Bajas (N)** — suppression list management.

The composer previews server-side (subject, both bodies, warnings, resolved
variant) and only sends with the explicit confirm checkbox. The previewed
variant is pinned on send — what the operator read is what goes out.

---

## Going to production

When the client accepts and the site goes to their real domain:

- Remove `noindex, nofollow`
- Add Open Graph tags (og:title, og:description, og:image 1200x630)
- Add JSON-LD structured data (LocalBusiness schema)
- Generate favicon from branding
- Create custom 404 page
- Update all URLs to the final domain

---

## Quality checklist

Before finishing a redesign:

- [ ] Colors based on the original branding
- [ ] Business logo included
- [ ] Favicon
- [ ] All social media links
- [ ] All blog content replicated
- [ ] All service pages with complete content
- [ ] Legal pages (as needed)
- [ ] Cookie banner (if applicable)
- [ ] Responsive (desktop + mobile)
- [ ] All internal links work
- [ ] Contact CTA visible (phone, email)
- [ ] Google Maps embedded
- [ ] SEO meta tags on all pages
- [ ] Google rating visible if >= 4.0 stars
- [ ] Contact forms replicated (if original had them)
