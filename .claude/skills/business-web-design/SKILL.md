---
name: business-web-design
description: Generate dynamic, hand-crafted static websites for real businesses (restaurants, clinics, shops, trades, studios) that read as designed by a human studio — never as an AI template. Use this skill for ANY request to create, redesign, or improve a web page, landing, demo, home, subpage, or showcase for a business — "haz la web", "crea la demo", "rediseña la página", "monta una landing", "build a site for my business" — even if the user doesn't mention design quality. Enforces a banned list of AI tells, business-derived design directions, robust motion, and a mechanical verification script.
---

# Business Web Design

Build static business websites that feel commissioned, not generated. The site must be
**dynamic** (motion with intent), **specific** (it could only belong to this business),
and **clean of AI tells** (verified mechanically, not by vibes).

## Why this skill exists

Left alone, generated pages converge on the statistical center of training data: centered
hero with a pill badge and two buttons, three equal feature cards with thin-line icons in
rounded boxes, Inter, a purple gradient, a uniform fade-in-up. That convergence IS the
"AI look" — it is the most probable output, so producing it requires no decisions at all.

The fix is not "be creative". It is a pipeline that (1) forces decisions to be made
*before* code, derived from the business's real world, and (2) verifies the output
*after* code against a falsifiable banned list. Intent without verification regresses to
the mean; verification without intent produces compliant-but-dead pages. You need both.

## Read-this-first map

| When | Read |
|---|---|
| Always, before any code | `references/banned.md` — the AI-tells list with counter-moves |
| Picking the visual direction | `references/directions.md` — 8 directions with token-locked starting points |
| Writing sections with icons/photos/copy | `references/copy-imagery-icons.md` |
| Adding any animation | `references/motion.md` — doctrine + the triple-degradation rule |
| Forms, embeds, analytics, or before delivery | `references/compliance-quality.md` — cookies/RGPD, contrast, legibility, orthography |
| Appointment-based trade (fisio, dental, estética…) | `references/booking-contact.md` — the wa.me scheduler pattern |

## Workflow

### 1. Explore the business's world — before any code

Defaults win when you skip straight to layout. Spend the first minutes in the business's
*physical* world, and write the answers down (in conversation or working notes):

- **Domain** — 5+ concepts, materials, textures, objects from this trade's real world.
  A fisioterapia: skin tone, kinesio tape, foam, anatomical line drawings, appointment
  cards. A taller mecánico: brushed steel, oil-stain amber, tread patterns, stamped plates.
- **Color world** — 5+ colors that exist naturally in that world. If the business already
  has brand colors (logo, sign, current site), **those win** — deepen and refine them,
  never replace them. Never invent a palette a designer would have to justify to the owner.
- **Signature** — ONE element (visual, structural, or interactive) that could only exist
  for THIS business. A menu that reads like a chalkboard ticket. A price list typeset like
  a parts catalog. If you can't name one, keep exploring.
- **Rejected defaults** — name the 3 most obvious moves for this type of site (e.g.
  "fisio = soft blue + stock photo of hands + 3 service cards") so you can't sleepwalk
  into them.

If the brief can't answer these (no business name, no trade, no facts), stop and ask.

### 2. Lock the direction

Pick ONE direction from `references/directions.md` (use the trade mapping; rotate fonts
within the pool — never reuse the previous project's display font). Then write the
**design lock** as a comment at the top of the first HTML file you generate:

```html
<!-- design-lock
direction: <direction name>
topology: <hero topology from the menu in directions.md + one-line why>
display-font: <name> | body-font: <name>
palette: <3-5 hex values + one-line provenance (brand / world)>
signature: <one sentence>
motion: <intensity 1-10 + one-line description>
rejected: <the 3 defaults from step 1>
brand-override: <ONLY if the client's verified brand requires a banned token, name it:
  "font=Poppins (logo wordmark)" or "accent=#7c3aed (verified vs logo)". Omit otherwise.>
-->
```

The lock and the data-signature element live on **index.html only** — they are
site-level artifacts. Subpages match the home's tokens (same families, palette, nav,
footer); they don't re-declare the lock. `brand-override` exists because the brand
always wins over our bans: when the client's real logo uses Poppins or their brand IS
purple, naming it in the lock downgrades that specific ban to a warning. It covers
exactly what it names — it is not a general escape hatch.

Topology is locked for the same reason fonts are: banning the centered-hero default
without choosing an alternative makes every page flee to the SAME next-most-probable
layout (the split hero, text left / visual right — we measured 6/6 convergence in evals).
Pick from the topology menu in `references/directions.md` and never repeat the previous
project's hero topology.

This block is mandatory — the verifier fails without it. It exists because intent that
lives only in your head dissolves the moment code generation starts pulling patterns.
Writing it down pins the decisions; the verifier checks the output against them.

### 3. Build

- **Content dictates layout.** Inventory the real content first (services, hours, photos,
  reviews, address), then design sections around what exists. Never scaffold "hero +
  features + testimonials + CTA" and pour content into it.
- **One primary action per page** (call, book, visit, WhatsApp). Everything else recedes.
- **Hard-code critical content in HTML.** JS enriches; if it fails, the page still reads.
- **Sections must differ structurally.** No two adjacent sections share the same layout
  topology. Max ONE uniform card grid per page — and never with icons on top (see icon
  policy in `references/copy-imagery-icons.md`).
- **Mark the signature element.** The element you named in the design lock carries a
  `data-signature` attribute in the HTML. This makes the signature falsifiable: the
  verifier fails when it's missing, because a signature you can't point to doesn't exist.
- **Mobile is a composition, not a squash.** Design the mobile layout as its own thing.
- **Real facts only in copy.** Street names, opening hours, years in business, dish names,
  review quotes. No sentence that could appear on a competitor's site unchanged.
- **Migrated client content keeps its voice.** Blog posts and service texts carried over
  verbatim go inside a `data-migrated` container — prose rules don't judge their words
  (see `compliance-quality.md`).
- **Appointment trades get the booking pattern.** A Contacto section with the wa.me
  scheduler from `booking-contact.md`: looks like a calendar, every slot is a real
  prefilled WhatsApp link, works without JS, `data-booking` on the container.
- **Compliance is part of the design.** Contrast ≥4.5:1, base type ≥16px, tildes and ¿¡
  correct, `lang="es"`, no cookie-setting embeds without consent, RGPD checkbox on any
  personal-data form. The bar lives in `compliance-quality.md`; the verifier enforces
  the mechanical slice.

### 4. Verify — mandatory, before showing anyone

Run the mechanical check:

```bash
python3 <skill-dir>/scripts/verify_design.py <output-dir>
```

Fix every FAIL and rerun until clean. Treat WARNs as a designer's punch list: resolve or
consciously accept each one. Then run the manual checks:

- **Swap test** — if you swapped the display font for Inter and the palette for
  purple-on-white, would the page feel different? If barely, you defaulted.
- **Squint test** — blur your eyes: clear hierarchy, one focal point per screen, nothing
  shouting.
- **Signature test** — point to the signature element on the page. If you can't, it
  doesn't exist.
- **The final question** (from the project quality bar): *would another AI given the same
  brief produce this exact page?* If yes, it's not done.

### 5. Hand off

Show the result (local preview), state the direction and signature in one short paragraph
(no design lecture), and offer adjustments. The client cares about the result, not the
process.

## Hard rules — never break

1. **No icon grids.** No row/grid of cards each topped by a small icon in a rounded
   container — the single most recognizable AI tell. Services get photography, big
   numerals, typographic lists, or trade-specific inline SVG drawn for this site.
2. **No emoji as UI.** Not as icons, not as bullets, not in headings or buttons.
3. **Banned fonts as primaries**: Inter, Roboto, Arial, system-only stacks — and the
   second wave: Space Grotesk, Geist, DM Sans, Poppins. Pick from the direction's pool.
   (Single exception: the client's verified brand, named in the lock's `brand-override`.)
4. **No purple→blue gradients. No gradient text on headlines.** Palette comes from the
   business's brand and world. (Same single exception: a verified purple brand, named
   in `brand-override`.)
5. **No centered hero + pill badge + two-button stack.** Compose the hero from the
   business's actual assets and signature.
6. **Animations must degrade — all three fallbacks** (project quality bar, QA-hardened):
   `.js`-gated styles (no JS → fully visible), a reveal-all failsafe timeout (~2.5s), and
   a `prefers-reduced-motion` query that shows content without animation.
7. **No filler copy** — in Spanish or English. "Soluciones integrales", "tu socio de
   confianza", "seamless", "elevate" are ship-blockers. Specific beats generic, always.
8. **No em-dashes in visible copy.** Use a period or comma. (It is the #1 LLM prose tell.)
9. **Typography needs two voices**: a characterful display font + a quiet body font.
   One-font pages read as unstyled templates.
10. **Robustness beats spectacle.** A solid page that's slightly less flashy beats a
    broken showcase. When a motion effect risks hiding content, content wins.

## Quartier integration

When working inside the quartier repo, this skill executes PLAYBOOK.md steps 5-6
(redesign HOME + subpages) and any new-site generation. Follow the PLAYBOOK output
conventions:

- Output to `projects/<name>/redesign/` (standalone HTML, inline CSS, relative links).
- `noindex, nofollow` meta on every demo page.
- Operator info in the footer (from `config.operator.json`).
- Subpages match the home's design lock (same tokens, nav, footer).
- Optimize images afterwards: `./run.sh ./tools/optimize-images.sh ...` (PLAYBOOK step 8).

The PLAYBOOK "Design quality bar" remains in force; this skill is its implementation.

## Extending this skill

- **New tell spotted in the wild** → add it to `references/banned.md` (tell + recognition
  + counter-move) and, if mechanically detectable, add a check to
  `scripts/verify_design.py`. Keep both in sync.
- **New direction** → add a block to `references/directions.md` (trades, feel, type pool,
  palette derivation, topology, motion signature). Nothing else changes.
- **New motion pattern** → add to `references/motion.md` with its degradation story.
- SKILL.md itself should stay stable — it's the contract, the references are the catalog.

## Files

```
SKILL.md                              ← this file (workflow + hard rules)
references/
  banned.md                           ← AI-tells catalogue: tell → recognition → counter-move
  directions.md                       ← 8 design directions + hero topology menu, by trade
  copy-imagery-icons.md               ← copy doctrine (ES-first), photo policy, icon policy
  motion.md                           ← motion doctrine, patterns, triple degradation
  compliance-quality.md               ← cookies/RGPD, contrast, legibility, orthography
  booking-contact.md                  ← wa.me scheduler pattern for appointment trades
scripts/
  verify_design.py                    ← mechanical tell + compliance detector (run on every output)
```
