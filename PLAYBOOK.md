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

Copy to deploy directory and convert relative paths to absolute. The deploy process depends on the user's hosting setup.

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
