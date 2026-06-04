# Compliance & quality bar

Legal compliance (cookies, RGPD), accessibility (contrast, legibility) and language
correctness are not polish — they are part of "looks professionally made". A beautiful
page with gray-on-gray text, a form that ignores RGPD, or a missing tilde reads as
amateur to exactly the audience these sites target. The verifier enforces the mechanical
slice; this file explains the why and covers what regex can't.

## Cookies — the decision table (aligns with PLAYBOOK step 7)

The rule is honest minimalism: **no banner unless something actually sets cookies.**
A banner on a cookieless site is noise and erodes trust.

| What the page uses | Banner + política de cookies? |
|---|---|
| Nothing third-party, GoatCounter (cookieless), fonts from Google Fonts CDN | **No banner.** Cleanest path — default for demos |
| Google Maps iframe, YouTube embed, Calendly/Cal.com embed | **Yes** — or better, avoid: static map image linking to Maps, youtube-nocookie.com, the wa.me booking pattern (`booking-contact.md`) |
| Analytics with cookies (GA4, Meta pixel, Hotjar, Clarity) | **Yes**, with prior consent blocking (script loads only after accept). For local-business sites, prefer GoatCounter and skip this entirely |

The verifier FAILs tracker scripts without a banner and WARNs on cookie-setting embeds,
suggesting the cookieless swap. Demos are noindex and short-lived, so embed WARNs are
acceptable there — but resolve them before client delivery.

## RGPD — forms

Any form collecting personal data (name, email, phone) needs ALL of:

1. A link to the **política de privacidad** (template in `templates/`).
2. An **unchecked consent checkbox** ("He leído y acepto la política de privacidad") —
   pre-checked boxes are not consent under RGPD.
3. Only the fields the purpose needs (a booking doesn't need a DNI).

The verifier FAILs personal-data forms missing the privacy link or the checkbox.
`mailto:` and WhatsApp links are NOT forms — no checkbox needed (the project's
zero-backend intake stays clean). Legal pages come from `templates/` (PLAYBOOK step 7):
aviso legal always; privacidad only when collecting data; cookies only when using them.

## Contrast — WCAG AA as the floor

- Body text vs background: **≥ 4.5:1**. The verifier computes it (resolving CSS vars)
  and FAILs below.
- Muted/secondary text: also ≥ 4.5:1 if it carries information. Below that, reserve it
  for large display text (≥ 24px, AA allows 3:1) or pure decoration. Verifier WARNs on
  `--*muted/secondary/text*` vars below 4.5:1.
- Text over photos: add a scrim or text shadow; verify against the photo's darkest AND
  lightest zones (manual — the verifier can't see the photo).
- Don't fix contrast by abandoning the palette: deepen the ink or lift the paper within
  the locked colors' temperature.

## Legibility

- Base font-size **≥ 16px** (1rem); body line-height **≥ 1.4** (1.5-1.6 for long prose).
  Verifier WARNs below both.
- Measure: 45-75 characters per line for prose (`max-width: 65ch` on text columns).
- Real hierarchy: if you need bold to rescue a paragraph, the type scale is wrong.
- Touch targets ≥ 44px on mobile for links/buttons that matter (call, WhatsApp, book).

## Language — Spanish that a proofreader would pass

The copy doctrine (`copy-imagery-icons.md`) covers voice; this is correctness:

- **Tildes are non-negotiable.** The verifier FAILs an unambiguous list (teléfono,
  atención, información, sábado, "X años"...) but the list is a tripwire, not a
  spell-checker: do a full read of every visible string before shipping.
- **Opening marks**: ¿ and ¡ always. The verifier WARNs when missing.
- `lang="es"` on `<html>` (screen readers mispronounce everything otherwise). WARN.
- No anglicism calques in UI copy: "Reserva", not "Bookea"; "Escríbenos", not "Dropea
  un mensaje".
- Numbers and units Spanish-style: 1.200 €, 9:00–14:00 (en-dash for ranges is correct
  typography — the em-dash ban is about prose).

## Migrated content (the carve-out)

Client-authored content migrated verbatim (blog posts, service descriptions — PLAYBOOK:
"don't summarize") is **their voice, not our copy**. Wrap it in a container with
`data-migrated` and the verifier exempts it from em-dash/filler/orthography checks.
Do NOT use `data-migrated` on copy you wrote — it's a provenance marker, not an escape
hatch. If migrated text has errors the client would want fixed (a clear typo), flag it
to them; don't silently edit their content.
