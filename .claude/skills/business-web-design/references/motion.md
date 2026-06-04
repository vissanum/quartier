# Motion

Dynamic is a requirement, not a garnish: a static page reads as cheap, and a page where
everything wiggles reads as AI. The craft is motion that communicates — and that can
never, under any failure mode, leave content invisible.

## The doctrine

1. **One orchestrated entrance.** The hero gets the budget: a staggered sequence
   (background → display type → supporting line → CTA) over ~0.9-1.4s total. This single
   well-built moment creates more "wow" than twenty scattered effects.
2. **Scroll reveals are sparse and varied.** Reveal the *section's lead element*, not
   every child. Vary the move per section type (a photo develops with clip-path, a list
   cascades, a numeral counts) — the uniform fade-in-up on everything is a banned tell.
3. **Micro-interactions give feedback.** Hover/focus on every interactive element,
   ~150-250ms, deceleration easing. Hover changes meaning (color, underline, depth), not
   size alone. No bounce/elastic in this context.
4. **Motion intensity comes from the design lock** (1-10, set by the direction). At 3,
   you get the entrance + micro-interactions only. At 7, add parallax, marquees, counters.
   Never exceed the lock — restraint is what reads as expensive.
5. **Content first.** If an effect competes with reading (parallax that moves text,
   reveals that delay above-the-fold content past ~1.5s), the effect loses.

## The triple degradation rule (non-negotiable)

QA-hardened project rule: any reveal-on-scroll system ships ALL THREE fallbacks. A demo
that renders blank for any visitor is worse than no animation at all.

1. **JS-gated styles.** Hidden states only apply under `.js`:
   ```html
   <script>document.documentElement.classList.add('js');</script>
   ```
   ```css
   .js .reveal { opacity: 0; transform: translateY(16px); }
   .reveal.is-visible { opacity: 1; transform: none; transition: ... }
   ```
   No JS → the class never lands → everything visible.
2. **Reveal-all failsafe.** ~2.5s after load, anything still hidden becomes visible:
   ```js
   setTimeout(() => document.querySelectorAll('.reveal:not(.is-visible)')
     .forEach(el => el.classList.add('is-visible')), 2500);
   ```
3. **Reduced-motion query.** Content visible without animation:
   ```css
   @media (prefers-reduced-motion: reduce) {
     .js .reveal { opacity: 1; transform: none; transition: none; }
   }
   ```
   Note: some Windows setups ship reduced-motion ON. Gate **entrance reveals and large
   movement** with it (content must be visible), but don't strip hover/focus feedback —
   those are usability, not decoration.

## Implementation pattern (vanilla, no build)

- `IntersectionObserver` with `threshold: 0.05` and a small `rootMargin` so reveals fire
  reliably on short viewports; observe once, then unobserve.
- Stagger via `transition-delay` on children (60-90ms steps, cap ~6 children).
- Prefer CSS transitions/animations driven by class toggles; JS only orchestrates.
- Wrap each init in a try/catch (`safe(fn)`) so one failing effect can't kill the rest.
- Idempotent: guard against double-init (`if (el.dataset.bound) return`).
- Respect the page weight: no animation library for what CSS does. GSAP only when the
  direction truly needs timeline orchestration (intensity ≥7), loaded locally, deferred.

## Catalog by intensity

**2-4 (Clinical Calm, Quiet Luxury):** hero stagger (opacity + 8px), underline draw on
nav hover, soft counter on one key number, breathing CTA (4s subtle scale loop, pauses
on reduced-motion).

**5-7 (Editorial Warm, Mediterranean Light, Mercado Fresco):** ken-burns hero (one photo,
20s, ease-in-out), clip-path photo develops, dot-leader menus that cascade, slow parallax
on full-bleed images (transform-only, ≤8% travel), marquee strip (pausable, duplicated
content for seamless loop).

**6-8 (Ink & Craft, Bold Local, Industrial Honest at the low end):** stamp-in type
(scale 1.04→1 + opacity, fast decel), ink/paper hover inversion, contact-sheet gallery
with hover develop, count-up numerals on scroll (once), diagonal section wipe on load.

Every catalog entry obeys the triple rule. When adding a new effect, document its
degradation story here or it doesn't ship.
