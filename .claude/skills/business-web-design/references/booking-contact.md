# Booking & contact pattern (appointment trades)

When the business lives on appointments, the site's job is to turn a visit into a
booked slot. These trades get a **Contacto section or page** with the booking pattern:

fisioterapia · clínica dental · psicología · abogado/asesoría/gestoría · estética ·
peluquería/barbería · podología · veterinaria · academia (trial class)

## The principle: mock the look, never the function

A Calendly-style widget that goes nowhere is fake UI (banned, M3) — and on a delivered
site it destroys trust: the patient picks a slot and nothing happens. The static-only
answer is a widget that LOOKS like a scheduler and WORKS through WhatsApp:

**every slot is a real `<a>` whose href is a prefilled wa.me message.**

```html
<section id="contacto" data-booking>
  <h2>Pide cita</h2>
  <div class="week">
    <div class="day">
      <h3>Martes 10</h3>
      <a href="https://wa.me/34947200300?text=Hola%2C%20quiero%20cita%20el%20martes%2010%20a%20las%2010%3A00"
         class="slot">10:00</a>
      <a href="https://wa.me/34947200300?text=Hola%2C%20quiero%20cita%20el%20martes%2010%20a%20las%2012%3A30"
         class="slot">12:30</a>
      <span class="slot slot--taken" aria-hidden="true">17:00</span>
    </div>
    <!-- one column per open day -->
  </div>
  <p class="fallback">O llama al <a href="tel:+34947200300">947 200 300</a></p>
</section>
```

Rules:

1. **Slots come from the real schedule** (config.json opening hours). Never invent
   availability; a generic "mornings / afternoons" split is honest when you don't know
   the agenda. Mark a few slots as taken only if the owner confirms a realistic pattern —
   fake scarcity is a copy tell (P4).
2. **Works with zero JS**: the grid is plain links. JS only adds polish (selected state,
   sticky summary). The degradation triple (motion.md) applies to any animation on it.
3. **Styled with the design-lock tokens.** It's YOUR site's scheduler, not a Calendly
   clone: the direction's type, palette, radius language. No third-party branding.
4. **`data-booking` on the container** — the verifier requires at least one live
   `wa.me`/`tel:` link inside it (dead-booking FAIL otherwise).
5. **tel: fallback always visible** for the audience that won't use WhatsApp (older
   patients call).
6. Cookieless and RGPD-clean by construction: no form, no consent needed. WhatsApp opens
   in the visitor's own app.

## On demos (the sales angle)

The widget doubles as pitch ammunition: "tus pacientes eligen hueco aquí y te llega un
WhatsApp" is concrete and demo-able. The wa.me number on a DEMO points to the demo's
contact flow (the business's real number) — never to the operator.

## The real-scheduler upgrade (maintenance upsell)

When a client wants real automation (calendar sync, reminders), embed Cal.com or
Calendly **as a paid upgrade**:

- Their embeds load third-party JS and set cookies → the consent banner row of
  `compliance-quality.md` applies (banner + política de cookies before the embed loads).
- Swap happens inside the same `data-booking` container; keep the tel: fallback.
- Price it into maintenance: scheduler + consent setup + the monthly check that the
  embed still loads is recurring work.

The wa.me pattern is the default because it costs nothing, breaks nothing, and most
local businesses already live in WhatsApp.
