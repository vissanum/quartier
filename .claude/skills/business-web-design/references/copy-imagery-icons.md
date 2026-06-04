# Copy, imagery, and icons

## Copy doctrine (Spanish-first)

These sites speak to neighbors, not to investors. Write like the owner on a good day:
direct, concrete, warm without performing warmth.

### Rules

1. **Every sentence carries a verifiable fact.** Street, hours, years, names of dishes
   and treatments, real prices when the owner publishes them. If a sentence could appear
   unchanged on a competitor's site, cut or sharpen it.
2. **Headline = what + where (+ for whom).** "Fisioterapia deportiva en el centro de
   Burgos", not "Tu bienestar es nuestra pasión". The display font supplies the emotion;
   the words supply the information.
3. **One voice.** Decide tú/usted per business (barbershop: tú; law firm: usted) and hold
   it everywhere, microcopy included.
4. **CTAs name the action**: "Llama al 947 …", "Reserva por WhatsApp", "Ven a probarlo".
   Never "Saber más" as primary.
5. **No em-dashes** in visible copy (the #1 LLM prose tell). Periods and commas.
6. **Banned vocabulary** (ship-blockers, the verifier greps these):
   - ES: soluciones integrales · tu socio de confianza · comprometidos con la excelencia
     · calidad y profesionalidad · líder en el sector · a tu alcance · ponemos a tu
     disposición · amplia experiencia (without years) · servicio integral
   - EN-in-ES: seamless · elevate · unlock · empower · premium experience · world-class
7. **Watch-list clichés** (verifier warns; rewrite unless genuinely apt): no dudes en
   contactarnos · estamos encantados de · trato cercano y profesional · equipo altamente
   cualificado.
8. **Proof must be real.** Quote actual Google reviews with attribution ("María L.,
   reseña de Google"). Real counts only. No testimonials beats invented ones.
9. **Source of truth:** the original site's content, the owner's brief, reviews, and
   public facts. Blog/service texts are migrated complete, never summarized (PLAYBOOK
   rule for redesigns).
10. **Migrated text is the client's voice.** Wrap carried-over content in a
   `data-migrated` container: the prose rules above (and the verifier's em-dash/filler/
   orthography checks) judge OUR copy, not theirs. Details in `compliance-quality.md`.
11. **Orthography is a ship-gate.** Tildes, opening ¿¡, clean RAE Spanish. The verifier
   trips on an unambiguous word list; the full pass is yours (reread every visible
   string — same pass as the self-audit below).

### Self-audit pass

After writing all copy, reread every visible string once, asking only: *would the owner
say this out loud to a customer?* Rewrite every line that sounds like a brochure.

## Imagery policy

Photo hierarchy (project rule, in order):

1. Original site assets (`original/assets/`) — already the business's truth.
2. Owner-provided photos.
3. Google Places photos (often surprisingly good for food/rooms).
4. Nothing — a typographic section beats a fake photo.
5. AI-generated only as last resort, **never for people or food**.

### Photo-dominant sites (galleries, food, rooms, portfolios)

When photography IS the content (40-photo restaurant, casa rural, tattoo portfolio),
the page is built around rhythm, not around sections-with-a-photo:

- **Vary the grid, not each cell**: a gallery may be uniform inside (that's what
  galleries are — the verifier doesn't fight photo grids), but break the rhythm every
  6-10 images with a full-bleed hero shot, a quote, or a caption block.
- **Mixed crops carry hierarchy**: the signature dish/room gets the wide crop; supporting
  shots get the tight texture crops. Equal-size-everything flattens the story.
- **Captions are copy**: real dish names, room names, neighborhood facts — never
  "Imagen 12".
- **Weight discipline**: lazy-load below the fold, explicit width/height, optimize at
  the end (PLAYBOOK step 8). A 40-photo page that scrolls like silk reads as expensive;
  one that janks reads as broken.

Treatment rules:

- **One treatment per site**, from the direction (duotone, warm grade, halftone, plain).
  Mixed treatments read as collage.
- Crop with intent: tight on texture (food, fabric, steel) for backgrounds; honest and
  wide for rooms and teams.
- Every `<img>` gets real `alt` text, width/height attributes (no layout shift), and
  `loading="lazy"` below the fold.
- Optimize at the end (PLAYBOOK step 8: `tools/optimize-images.sh`, plus `--webp`).

## Icon policy

The icon grid is the #1 visual tell. Default is **no icons at all**.

When a section seems to "need" icons, it actually needs one of these:

| Instead of | Use |
|---|---|
| 3 cards with icons | Photos of the actual services (hierarchy above) |
| Icon + "Calidad" label | A sentence with a fact, set in good type |
| Numbered icon steps | Big display-font numerals (01 02 03 as typography, no eyebrow labels) |
| Decorative section icons | The direction's texture/signature element |

If icons are genuinely functional (a contact row: phone, WhatsApp, map pin), then:

- **Draw them inline as SVG for this site** — consistent stroke width matched to the
  body font's weight, the site's palette, 20-24px. Trade-specific beats generic: a
  scissors glyph drawn for this barbershop, not lucide's.
- **Never** in rounded/circled containers above headings.
- **Always** beside a text label, never icon-only.
- Maximum one icon family per site; if you can't keep stroke/corner language consistent,
  use none.
- Emoji are never icons (hard rule).

UI affordances that read as native (a real `<details>` marker, a form's focus ring) are
not "icons" — style them with the palette and move on.
