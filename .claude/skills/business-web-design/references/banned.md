# Banned: the AI-tells catalogue

Every entry: the tell → how to recognize it → the counter-move. Rules are written to be
falsifiable — when a count or threshold appears, the verifier (`scripts/verify_design.py`)
enforces it; the rest you check by reading your own output before showing it.

A banned list alone produces compliant-but-dead pages. Every ban here pairs with a
positive replacement: do the replacement, not just the avoidance.

---

## Layout & structure

### L1. The canonical skeleton ★
**Tell:** hero → 3 feature cards → testimonials → pricing/CTA, regardless of business.
**Recognize:** you could swap the logo for a competitor's and nothing would feel wrong.
**Instead:** inventory the real content first; let the strongest asset lead (signature
dish photos, the 40-years story, the before/after gallery). Section order follows what
this business has to show, not a template's slots.

### L2. Three equal feature cards
**Tell:** 3 (or 4) identical-height cards in a row, same padding, icon on top.
**Recognize:** ≥3 sibling elements with identical internal structure. The verifier counts.
**Instead:** a 2-column zigzag with real photos, an editorial numbered list (big numerals,
generous type), one wide card + two narrow, or a horizontal scroll strip. Services with
different importance get different visual weight.

### L3. Centered hero + pill badge + two buttons ★
**Tell:** small rounded pill ("✨ Nuevo"), H1 below, subtitle, primary+secondary button.
**Recognize:** pill-radius element directly above the H1.
**Instead:** compose from the business's assets: full-bleed photo with type overlaid,
split hero (type left, image right at unequal ratio), type-only hero with the display
font doing the work. One CTA — the page's single primary action.

### L4. Uniform symmetric grid everywhere
**Tell:** every section a centered max-width column with evenly spaced children.
**Instead:** at least one asymmetric moment per page — overlap, an element breaking the
container, a diagonal flow, an off-center focal point. One is enough; ten is noise.

### L5. Section-label eyebrows ("01 / SERVICIOS")
**Tell:** tiny tracked-uppercase labels with numbers above every heading.
**Recognize:** verifier flags `0N /` patterns and counts tracked-uppercase labels.
**Instead:** let headings be headings. If sections need wayfinding, use the nav.

### L6. Cards inside cards
**Tell:** a bordered/shadowed card containing more bordered/shadowed cards.
**Instead:** one level of surface depth per region; use spacing and type to group inside.

### L7. Stat banner row
**Tell:** "250+ clientes · 15 años · 99% satisfacción" in a 3-up row with big numbers.
**Instead:** if a number is real and impressive, give it a sentence with context ("Desde
1986 en la calle Ribera"). Fake-precise numbers (99%, 500+) are copy tells too — see C4.

### L8. The reflexive split hero (second-order default)
**Tell:** text left, visual right, on every site. Not a bad layout — a monoculture. It is
where the model flees when the centered hero (L3) is banned: ban one default without a
menu of alternatives and the output slides to the next-most-probable layout. Measured:
6/6 convergence in our own evals.
**Recognize:** hero = exactly two columns, text block | visual block. Verifier warns.
**Instead:** lock a topology from the menu in `directions.md` (poster typographic,
full-bleed overlay, editorial column, broken grid, object stage, split). Split is allowed
when *chosen* — at most once per three projects, never at 50/50.

---

## Typography

### T1. Inter / Roboto / Arial / system-only ★★
**Tell:** the strongest single signal of "never intentionally styled". Verifier fails it.
**Instead:** pick from the locked direction's pool (see `directions.md`).

### T2. The second wave: Space Grotesk, Geist, DM Sans, Poppins
**Tell:** the fonts AIs reach for when told to avoid Inter. Converging on them is the
same failure one step removed. Verifier fails them as primaries. The display-serif
equivalents — Fraunces, Playfair Display, DM Serif — are sliding into the same bucket
(we measured Fraunces in 3 of 6 eval outputs) and are excluded from every pool.
**Instead:** the direction pools deliberately exclude them; rotate within the pool.

### T3. One font for everything
**Tell:** a single family carrying display, body, labels at similar weights. Reads as an
unstyled wireframe.
**Recognize:** verifier counts loaded families on the home page; <2 fails.
**Instead:** characterful display + quiet body. The pairing carries the personality.
**Exception (deliberate single-family):** ONE family at ≥3 weights spanning ≥500
(e.g. 100/400/900 — extreme weight contrast doing the pairing's job), or the lock
declaring the same family for display and body on purpose. The verifier passes both.
Subpages aren't re-judged: typography is the home's decision (they get consistency
warnings only).

### T4. The serif-italic accent word
**Tell:** sans headline with one *italic serif* word ("Cuidamos *cada* detalle").
**Instead:** if a word needs emphasis, weight or color from the locked palette does it.

### T5. Tracked-uppercase microlabels everywhere
**Tell:** `text-transform: uppercase; letter-spacing: .2em` on every small label.
**Recognize:** more tracked-uppercase elements than sections → too many (verifier warns).
**Instead:** ration to one use maximum per page, or none.

---

## Color & surfaces

### C1. Purple→blue gradient ★★ / gradient hero text ★
**Tell:** `#7c3aed → #2563eb` and family; `background-clip: text` on headlines.
**Recognize:** verifier greps both.
**Instead:** the palette exists before you code — brand-derived, locked in the design
lock. Headlines are set in solid ink colors.
**Brand exception:** when the client's REAL brand is purple (logo, sign), name it in the
lock's `brand-override:` — the verifier downgrades to WARN. The brand always wins; the
ban exists for invented palettes, not real ones.

### C2. Pure-white canvas / "tasteful" cream by reflex / charcoal+neon
**Tell:** the three default canvases (light SaaS, minimal-luxury beige, dark dev-tool).
**Instead:** the canvas comes from the color world (paper, plaster, tile, steel, flour).
Off-whites and off-blacks with the trade's temperature in them.

### C3. Timid evenly-distributed palette
**Tell:** five colors used in equal amounts; nothing dominates.
**Instead:** one dominant, one sharp accent, used identically across all sections (the
same accent for every interactive element — consistency lock).

### C4. Uniform 16px radius + faint uniform shadow on everything
**Tell:** every element rounded the same, every card with the same `0 1px 3px rgba(0,0,0,.1)`.
**Recognize:** verifier warns when one radius value dominates.
**Instead:** pick ONE shape language (sharp / soft / pill — never mixed), and ONE depth
strategy (borders / shadows / surface shifts). Vary radius by element scale if soft.

### C5. Glassmorphism + glow orbs as decoration
**Tell:** `backdrop-filter: blur` cards floating over gradient blobs.
**Instead:** texture from the trade's world: grain, paper, halftone, brushed metal —
subtle, and only if the direction calls for it.

### C6. Colored side-tab border on cards
**Tell:** 4px colored left/top border on a rounded card. Named "the single most
recognizable tell of AI-generated UI".
**Instead:** if a card needs emphasis, surface shift or scale does it.

### C7. Pure #000000
**Tell:** true black text/background.
**Instead:** off-black with the palette's temperature (e.g. `#1a1714` warm, `#14171a` cold).

---

## Iconography (see copy-imagery-icons.md for the full policy)

### I1. Thin-line icon in a rounded container atop each card ★
**Tell:** lucide/heroicons 1.5px-stroke icon in a 48px rounded square, repeated per card.
**Recognize:** verifier detects repeated svg-first card structures.
**Instead:** photography, numerals, type — or custom inline SVG drawn for this trade.

### I2. Emoji as UI
**Tell:** ✨🚀💪 as bullets, icons, or in headings/buttons. Project hard rule: banned.
**Instead:** real glyphs are typography; everything else is an asset decision.

### I3. The sparkle ✦ motif
**Tell:** the four-pointed star as universal "premium/AI" decoration.
**Instead:** the signature element IS the decoration budget. Spend it there.

---

## Copy (see copy-imagery-icons.md for the writing doctrine)

### P1. Aspirational vapor headline
**Tell:** "Tu bienestar, nuestra pasión", "Build the future", "Elevamos tu negocio".
**Instead:** the headline states what the business does, where, for whom — in words the
owner would actually say. "Fisioterapia deportiva en el centro de Burgos."

### P2. Filler vocabulary
**Tell (ES):** "soluciones integrales", "tu socio de confianza", "comprometidos con la
excelencia", "calidad y profesionalidad", "a tu alcance", "líder en el sector".
**Tell (EN loanwords in Spanish sites):** seamless, premium experience, elevate, unlock.
**Recognize:** verifier greps a vocabulary list (FAIL for slop, WARN for clichés).
**Instead:** every sentence carries a verifiable fact. If it could be deleted without
losing information, delete it.

### P3. Em-dash ★
**Tell:** the LLM's signature punctuation. One visible em-dash is one too many.
**Recognize:** verifier counts `—` in text nodes.
**Instead:** a period. Spanish marketing copy barely uses the raya; commas and full stops
read more natural.
**Scope (audit-calibrated):** the rule targets prose WE write. Exempt: `<title>`
separators (browser-tab convention), migrated client content (`data-migrated`), and
en-dashes in ranges (9:00–14:00 — correct typography). Bracketed placeholders with
dashes get a WARN to fix before delivery, not a block.

### P4. Fake-perfect proof
**Tell:** "99% satisfacción", "+500 clientes", testimonials by "María G." that all sound
alike, generic avatars.
**Instead:** real review quotes (Google reviews exist — quote them, attributed), real
years, real counts, or nothing. A demo with no testimonials beats one with fake ones.

### P5. Hedging and announcement formulas
**Tell:** "puede ayudarte a", "no dudes en contactarnos", "estamos encantados de".
**Instead:** direct: "Llama y te damos cita esta semana."

---

## Imagery

### M1. Generic stock
**Tell:** diverse-team-at-laptop, hands-with-tablet, the impossibly lit office.
**Instead:** the project photo hierarchy: original site assets > owner's photos > Google
Places photos > nothing. AI-generated images only as last resort, never for people/food.

### M2. 3D blobs and liquid chrome
**Tell:** abstract glossy shapes floating in gradient space.
**Instead:** if no photos exist, typographic composition or trade-specific SVG
illustration beats abstract filler.

### M3. div-built fake screenshots / fake UI
**Tell:** a "dashboard" mocked from divs inside a browser-chrome frame.
**Instead:** local businesses don't need product shots. Show the real thing: the room,
the food, the work.

---

## Motion (see motion.md for the doctrine)

### A1. Uniform fade-in-up on everything ★
**Tell:** every section enters with the same 0.5s translateY fade. Or no motion at all.
**Recognize:** verifier checks reveal-class count vs. variation and stagger.
**Instead:** one orchestrated hero entrance + varied, sparse scroll reveals (see catalog).

### A2. Bounce/elastic easing
**Tell:** overshooting springs on UI elements.
**Instead:** deceleration curves (`cubic-bezier(0.22, 1, 0.36, 1)` family). Calm is craft.

### A3. Motion without fallbacks
**Tell:** content invisible until JS reveals it; blank page on slow/blocked JS.
**Recognize:** verifier requires the triple degradation when reveals are present.
**Instead:** the triple rule from the quality bar — .js-gating, ~2.5s failsafe,
reduced-motion query. Non-negotiable.

### A4. Scroll hijacking / decorative spinners / cursor gimmicks
**Tell:** motion that takes control instead of giving feedback.
**Instead:** motion communicates (state, attention, brand) or it goes.

---

## The meta-rule

Each tell above is the *absence of a decision*. The page stops looking AI-made when every
visible choice traces back to this business: its colors, its trade's textures, its real
words, its one signature element. Bans prevent the slide back to the mean; the design
lock is what actually replaces it.
