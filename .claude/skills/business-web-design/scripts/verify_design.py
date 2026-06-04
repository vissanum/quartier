#!/usr/bin/env python3
"""
verify_design.py — mechanical AI-tell + compliance detector for generated sites.

Scans HTML (and sibling CSS) for the banned patterns catalogued in
references/banned.md plus the compliance bar in references/compliance-quality.md.
Every FAIL is a ship-blocker; every WARN is a designer's punch-list item to
resolve or consciously accept.

Site model (v3): the design-lock, data-signature and typography pairing are
SITE-level artifacts that live in index.html (the "home"). Subpages are checked
for content/compliance tells and for token consistency with their home, not for
re-declaring the lock. A file named index.html at the root of a scanned path is
its home; everything else under that path is a subpage of it.

Brand exceptions: a `brand-override:` line inside the design-lock naming the
specific font/color (e.g. "brand-override: font=Poppins (client logo),
accent=#7c3aed (verified vs logo)") downgrades the matching ban to WARN.

Usage:
    python3 verify_design.py <dir-or-file> [more...] [--json]

Exit codes: 0 = clean (warnings allowed), 1 = at least one FAIL, 2 = usage error.
Stdlib only — no dependencies.
"""

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

# ---------------------------------------------------------------- constants

VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
             "link", "meta", "param", "source", "track", "wbr"}

GENERIC_FAMILIES = {"serif", "sans-serif", "monospace", "cursive", "fantasy",
                    "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace",
                    "inherit", "initial", "unset", "emoji", "math"}

BANNED_FAMILIES = {"inter", "inter tight", "roboto", "space grotesk", "geist",
                   "geist sans", "dm sans", "poppins"}
# Arial/Helvetica only banned as the *primary* (first) family of a stack.
BANNED_AS_PRIMARY = {"arial", "helvetica", "helvetica neue"}

PURPLE_HEXES = {"7c3aed", "8b5cf6", "a855f7", "9333ea", "7e22ce", "6d28d9",
                "5b21b6", "6366f1", "4f46e5", "4338ca", "818cf8", "c084fc",
                "d8b4fe", "a78bfa"}
BLUE_HEXES = {"2563eb", "3b82f6", "1d4ed8", "1e40af", "60a5fa", "0ea5e9",
              "38bdf8", "2dd4bf"}

FAIL_VOCAB = [
    # Spanish filler (ship-blockers per copy doctrine)
    "soluciones integrales", "tu socio de confianza", "comprometidos con la excelencia",
    "calidad y profesionalidad", "líder en el sector", "a tu alcance",
    "ponemos a tu disposición", "servicio integral",
    # English startup slop
    "seamless", "elevate your", "unlock your", "unlock the", "empower",
    "world-class", "premium experience", "cutting-edge", "best-in-class",
]
WARN_VOCAB = [
    "no dudes en contactarnos", "estamos encantados de",
    "trato cercano y profesional", "equipo altamente cualificado",
    "amplia experiencia",
]

# Unambiguous Spanish words that REQUIRE an accent; their bare forms are
# (near-)nonexistent in correct business copy. Conservative on purpose.
MISSING_TILDE = [
    "telefono", "atencion", "informacion", "direccion", "ubicacion",
    "sabado", "miercoles", "tambien", "sesion", "numero", "garantia",
    "clinica", "medico", "estetica", "peluqueria", "facil", "rapido",
    "proximo", "proxima", "espana", "menu", "categoria", "valoracion",
]

# Third-party hosts that set cookies / track. Trackers are ship-blockers
# without a consent banner; embeds get a WARN with a fix suggestion.
TRACKER_HOSTS = ["googletagmanager.com", "google-analytics.com",
                 "connect.facebook.net", "static.hotjar.com", "clarity.ms",
                 "cdn.segment.com", "doubleclick.net", "analytics.tiktok.com"]
EMBED_HOSTS = [("youtube.com/embed", "use youtube-nocookie.com instead"),
               ("google.com/maps/embed", "needs consent — or swap for a static "
                                         "map image linking to Maps"),
               ("maps.google.", "needs consent — or swap for a static map image "
                                "linking to Maps"),
               ("calendly.com", "scheduler embeds set cookies — needs consent "
                                "(see references/booking-contact.md for the "
                                "cookieless wa.me pattern)"),
               ("cal.com/embed", "scheduler embeds set cookies — needs consent")]
# Cookieless by design — never flagged: gc.zgo.at / goatcounter.com,
# youtube-nocookie.com, fonts.googleapis/gstatic (no cookies on font CDN).

EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F0FF"
    "\U00002B00-\U00002BFF\U0001F900-\U0001F9FF️]"
)
# Typographic glyphs that are NOT emoji-as-UI: review stars, checks, arrows.
# (The ✦/✧ sparkles and true emoji blocks stay banned — see banned.md I2/I3.)
TYPOGRAPHIC_GLYPHS = "★☆✓✔✕✗→←·•–️"


def strip_typographic(text):
    return text.translate({ord(c): None for c in TYPOGRAPHIC_GLYPHS})


HEX_IN_GRADIENT_RE = re.compile(r"gradient\([^;{}]*\)", re.I)
HEX_RE = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
PHONE_RE = re.compile(r"^[\d\s+./()·-]{7,}$")


def line_of(text, idx):
    return text.count("\n", 0, idx) + 1


def norm_hex(h):
    h = h.lower()
    return "".join(c * 2 for c in h) if len(h) == 3 else h


# ---------------------------------------------------------------- html tree

class Node:
    __slots__ = ("tag", "attrs", "children", "parent", "line", "texts", "order")

    def __init__(self, tag, attrs, parent, line, order):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []      # element children only
        self.parent = parent
        self.line = line
        self.texts = []         # direct text fragments
        self.order = order      # document order index

    def text(self, deep=True):
        out = list(self.texts)
        if deep:
            for c in self.children:
                out.append(c.text(True))
        return " ".join(t.strip() for t in out if t.strip())

    def classes(self):
        return (self.attrs.get("class") or "").lower()

    def has_ancestor(self, pred):
        p = self.parent
        while p is not None:
            if pred(p):
                return True
            p = p.parent
        return False


class TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", [], None, 0, 0)
        self.stack = [self.root]
        self.all_nodes = []
        self.comments = []
        self.styles = []        # contents of <style>
        self.scripts = []       # contents of <script>
        self._counter = 0
        self._in_raw = None     # 'style' | 'script' | None

    def handle_starttag(self, tag, attrs):
        self._counter += 1
        node = Node(tag, attrs, self.stack[-1], self.getpos()[0], self._counter)
        self.stack[-1].children.append(node)
        self.all_nodes.append(node)
        if tag in ("style", "script"):
            self._in_raw = tag
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self._counter += 1
        node = Node(tag, attrs, self.stack[-1], self.getpos()[0], self._counter)
        self.stack[-1].children.append(node)
        self.all_nodes.append(node)

    def handle_endtag(self, tag):
        if tag in ("style", "script"):
            self._in_raw = None
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self._in_raw == "style":
            self.styles.append(data)
        elif self._in_raw == "script":
            self.scripts.append(data)
        else:
            self.stack[-1].texts.append(data)

    def handle_comment(self, data):
        self.comments.append(data)


def in_migrated(node):
    """True when the node sits inside a data-migrated container — client-authored
    content carried over verbatim (PLAYBOOK: don't summarize). Their voice, not
    our copy: prose tells don't apply (see copy-imagery-icons.md)."""
    if "data-migrated" in node.attrs:
        return True
    return node.has_ancestor(lambda p: "data-migrated" in p.attrs)


def in_chrome(node):
    return node.tag in ("nav", "header", "footer") or \
        node.has_ancestor(lambda p: p.tag in ("nav", "header", "footer"))


# ---------------------------------------------------------------- findings

class Report:
    def __init__(self):
        self.items = []  # (severity, check, message, file, line)

    def fail(self, check, msg, file, line=None):
        self.items.append(("FAIL", check, msg, str(file), line))

    def warn(self, check, msg, file, line=None):
        self.items.append(("WARN", check, msg, str(file), line))

    @property
    def fails(self):
        return [i for i in self.items if i[0] == "FAIL"]


# ---------------------------------------------------------------- fonts

def families_in_css(css):
    """All font families referenced in font-family declarations or --font* vars."""
    fams, primaries = set(), set()
    for m in re.finditer(r"(?:font-family|--font[\w-]*)\s*:\s*([^;}{]+)", css, re.I):
        parts = [p.strip().strip("'\"").lower() for p in m.group(1).split(",")]
        parts = [p for p in parts if p and not p.startswith("var(")]
        if not parts:
            continue
        primaries.add(parts[0])
        fams.update(parts)
    return fams, primaries


def google_families(html_text):
    """Loaded families -> set of declared weights (ints)."""
    fams = {}
    for m in re.finditer(r"fonts\.googleapis\.com/css2?\?([^\"'>]+)", html_text, re.I):
        for fm in re.finditer(r"family=([^&]+)", m.group(1)):
            spec = fm.group(1)
            name = spec.split(":")[0].replace("+", " ").strip().lower()
            weights = {int(w) for w in re.findall(r"\b([1-9]00)\b", spec)}
            fams.setdefault(name, set()).update(weights)
    return fams


def check_fonts(rep, f, html_text, css, role, home_ctx):
    loaded = google_families(html_text)
    declared, primaries = families_in_css(css)
    everything = set(loaded) | declared
    override = (home_ctx.get("override") or "").lower()

    for fam in sorted(everything & BANNED_FAMILIES):
        if fam in override:
            rep.warn("banned-font", f'"{fam}" is an AI-default family, allowed only '
                     f"because the design-lock brand-override names it — confirm it "
                     f"is really the client's brand (T1/T2)", f)
        else:
            rep.fail("banned-font", f'"{fam}" is a banned AI-default family (T1/T2)', f)
    for fam in sorted(primaries & BANNED_AS_PRIMARY):
        if fam not in override:
            rep.fail("banned-font", f'"{fam}" used as primary family (T1)', f)

    overridden = {fam for fam in BANNED_FAMILIES if fam in override}
    real = {x for x in everything if x not in GENERIC_FAMILIES} - (BANNED_FAMILIES - overridden)
    uses_font_vars = bool(re.search(r"var\(\s*--font", css, re.I))

    if role == "home":
        if len(real) < 2:
            # Deliberate single-family-with-weight-contrast is legitimate craft
            # (one family, >=3 weights spanning >=500 — e.g. Archivo 100/400/900),
            # as is a lock that names the same family for display and body.
            ok = False
            if len(real) == 1:
                fam = next(iter(real))
                weights = loaded.get(fam, set())
                if len(weights) >= 3 and max(weights) - min(weights) >= 500:
                    ok = True
                lock = home_ctx.get("lock") or ""
                m_d = re.search(r"display-font:\s*([^|\n]+)", lock, re.I)
                m_b = re.search(r"body-font:\s*([^|\n]+)", lock, re.I)
                if m_d and m_b and m_d.group(1).strip().lower() == m_b.group(1).strip().lower():
                    ok = True
            if not ok:
                rep.fail("single-font", f"only {len(real)} non-generic family in use; "
                         "pair a display + body font, or commit to ONE family with "
                         ">=3 weights spanning >=500 (T3)", f)
        elif len(real) > 3:
            rep.warn("font-count", f"{len(real)} families loaded — more than 3 reads "
                     "as inconsistency and slows the page", f)
    else:
        # Subpage: typography is the home's decision. Flag only what's checkable.
        home_fams = home_ctx.get("families") or set()
        foreign = real - home_fams if home_fams else set()
        if foreign:
            rep.warn("subpage-fonts", f"subpage loads families not in the home's set: "
                     f"{', '.join(sorted(foreign))} — subpages match the home's design "
                     "lock", f)
        elif len(real) == 0 and not uses_font_vars:
            rep.warn("subpage-fonts", "no families loaded and no --font vars used — "
                     "verify this page actually gets the site's typography "
                     "(pages are standalone; fonts don't inherit across files)", f)


# ---------------------------------------------------------------- color

def check_color(rep, f, css, html_text, home_ctx):
    override = (home_ctx.get("override") or "").lower()
    override_hexes = {norm_hex(h.group(1)) for h in HEX_RE.finditer(override)}
    purple_overridden = bool(override_hexes & PURPLE_HEXES) or \
        "purple" in override or "morado" in override or "lila" in override

    for m in HEX_IN_GRADIENT_RE.finditer(css):
        hexes = {norm_hex(h.group(1)) for h in HEX_RE.finditer(m.group(0))}
        if hexes & PURPLE_HEXES and hexes & BLUE_HEXES:
            if purple_overridden:
                rep.warn("purple-gradient", "purple→blue gradient allowed only by the "
                         "design-lock brand-override — confirm against the real brand "
                         "(C1)", f, line_of(css, m.start()))
            else:
                rep.fail("purple-gradient", "purple→blue gradient (the canonical tell, "
                         "C1)", f, line_of(css, m.start()))
        elif hexes & PURPLE_HEXES and not purple_overridden:
            rep.warn("purple-gradient", "gradient using AI-default purple family — "
                     "keep only if it is genuinely the brand color (C1)",
                     f, line_of(css, m.start()))
    for m in re.finditer(r"(?:-webkit-)?background-clip\s*:\s*text", css, re.I):
        rep.fail("gradient-text", "gradient/clipped text headline (C1)",
                 f, line_of(css, m.start()))
    for m in re.finditer(r"(?:color|background(?:-color)?)\s*:\s*#000(?:000)?\b", css, re.I):
        rep.warn("pure-black", "pure #000 — use a temperature-matched off-black (C7)",
                 f, line_of(css, m.start()))
    # Glassmorphism: count distinct glass SURFACES — dedupe the -webkit- twin
    # and the same selector re-declared per media query.
    css_nowebkit = re.sub(r"-webkit-backdrop-filter[^;}]*", "", css, flags=re.I)
    glass_selectors = {m.group(1).strip()[-60:] for m in re.finditer(
        r"([^{}@]+)\{[^}]*backdrop-filter\s*:[^;}]*blur", css_nowebkit, re.I)}
    if len(glass_selectors) > 2:
        rep.warn("glassmorphism", f"{len(glass_selectors)} distinct glass surfaces "
                 f"({', '.join(sorted(glass_selectors))[:80]}) — glass as decoration "
                 "is a tell (C5)", f)


def check_radius(rep, f, css):
    vals = [m.group(1).strip() for m in
            re.finditer(r"border-radius\s*:\s*([^;}{]+)", css, re.I)]
    firsts = [v.split()[0] for v in vals if v]
    if len(firsts) >= 5:
        top = max(set(firsts), key=firsts.count)
        share = firsts.count(top) / len(firsts)
        if share > 0.85 and top not in ("0", "0px"):
            rep.warn("uniform-radius", f"{top} is {share:.0%} of {len(firsts)} "
                     "border-radius values — vary by element scale or go sharp (C4)", f)


def check_uppercase_labels(rep, f, css, tree):
    rules = re.findall(
        r"\{[^}]*text-transform\s*:\s*uppercase[^}]*letter-spacing\s*:\s*(0?\.\d+em|[1-9]px)[^}]*\}",
        css, re.I) + re.findall(
        r"\{[^}]*letter-spacing\s*:\s*(0?\.\d+em|[1-9]px)[^}]*text-transform\s*:\s*uppercase[^}]*\}",
        css, re.I)
    sections = sum(1 for n in tree.all_nodes if n.tag == "section") or \
        sum(1 for n in tree.all_nodes if n.tag == "h2")
    if len(rules) > max(2, sections // 2):
        rep.warn("tracked-uppercase", f"{len(rules)} tracked-uppercase label styles for "
                 f"~{sections} sections — ration to one or none (T5)", f)


# ---------------------------------------------------------------- copy

def check_text_content(rep, f, tree):
    visible = []
    for n in tree.all_nodes:
        if n.tag in ("script", "style", "noscript"):
            continue
        for t in n.texts:
            if t.strip():
                visible.append((t, n))

    # Em-dash: body prose only. <title> separators ("Page — Business") are a
    # universal browser-tab convention; migrated client content is their voice;
    # bracketed [FILL IN — x] placeholders get a WARN, not a block.
    for t, n in visible:
        if "—" not in t or n.tag == "title" or in_migrated(n):
            continue
        if re.search(r"\[[^\]]*—[^\]]*\]", t):
            rep.warn("placeholder-dash", f'em-dash inside a placeholder: '
                     f'"{t.strip()[:50]}" — swap for ":" or "·" before delivery', f, n.line)
        else:
            rep.fail("em-dash", f'em-dash in visible copy: "{t.strip()[:60]}" (P3)',
                     f, n.line)

    for t, n in visible:
        if n.tag in ("h1", "h2", "h3", "h4", "a", "button", "li", "span", "p", "div"):
            if EMOJI_RE.search(strip_typographic(t)):
                rep.fail("emoji-ui", f'emoji used in <{n.tag}>: "{t.strip()[:40]}" (I2)',
                         f, n.line)

    own = " ".join(t for t, n in visible
                   if n.tag != "title" and not in_migrated(n)).lower()
    for phrase in FAIL_VOCAB:
        if phrase in own:
            rep.fail("filler-copy", f'banned phrase "{phrase}" (P2)', f)
    for phrase in WARN_VOCAB:
        if phrase in own:
            rep.warn("filler-copy", f'cliché "{phrase}" — rewrite with a fact (P2)', f)
    for m in re.finditer(r"\b0[0-9]\s*[/·]", own):
        rep.warn("eyebrow-numbers", 'section eyebrow numbering ("01 /") is a tell (L5)', f)
        break
    if re.search(r"\b(99|100)\s*%\s*(de\s+)?(satisfacción|clientes\s+satisfechos)", own):
        rep.warn("fake-proof", "suspiciously perfect satisfaction stat (P4)", f)

    check_orthography(rep, f, visible)


def check_orthography(rep, f, visible):
    """Spanish orthography: unambiguous missing tildes FAIL; missing opening
    marks WARN. Migrated client prose is exempt (their voice)."""
    own_nodes = [(t, n) for t, n in visible if n.tag != "title" and not in_migrated(n)]
    flagged = set()
    for t, n in own_nodes:
        low = t.lower()
        for w in MISSING_TILDE:
            if w in flagged:
                continue
            if re.search(rf"\b{w}\b", low):
                rep.fail("orthography", f'"{w}" is missing its tilde: '
                         f'"{t.strip()[:50]}" — copy must be grammatically clean', f, n.line)
                flagged.add(w)
        m = re.search(r"\b(\d+)\s+anos\b", low)
        if m and "anos-years" not in flagged:
            rep.fail("orthography", f'"{m.group(0)}" — that needs to be "años"', f, n.line)
            flagged.add("anos-years")
    own_text = " ".join(t for t, _ in own_nodes)
    if "?" in own_text and "¿" not in own_text:
        rep.warn("orthography", "questions without opening ¿ — Spanish copy uses "
                 "both marks", f)
    if re.search(r"[a-záéíóúñ]!", own_text, re.I) and "¡" not in own_text:
        rep.warn("orthography", "exclamations without opening ¡", f)


# ---------------------------------------------------------------- structure

def sig(node, max_tags=6):
    """Two-level structural signature of a card-like element.

    svg is treated as an atomic leaf: its inner shapes (path/circle/rect) vary
    per icon, and including them made three same-structured icon cards hash to
    three different signatures (false negative found in eval grading)."""
    parts = []
    for c in node.children[:max_tags]:
        if c.tag == "svg":
            parts.append("svg")
            continue
        sub = ",".join("svg" if g.tag == "svg" else g.tag for g in c.children[:3])
        parts.append(f"{c.tag}[{sub}]" if sub else c.tag)
    return ">".join(parts)


def check_card_grids(rep, f, tree):
    flagged_icon = False
    flagged_uniform = False
    for n in tree.all_nodes:
        kids = [c for c in n.children if c.tag not in ("script", "style")]
        if len(kids) < 3:
            continue
        groups = {}
        for k in kids:
            groups.setdefault(sig(k), []).append(k)
        for s, members in groups.items():
            if len(members) < 3 or not s:
                continue
            has_svg = "svg" in s
            has_heading = re.search(r"\bh[2-6]\b", s)
            tag_count = s.count(">") + s.count(",") + 1
            if has_svg and has_heading and not flagged_icon:
                rep.fail("icon-grid", f"{len(members)} identical cards with icon + "
                         f"heading structure ({s[:60]}) — the #1 visual tell (I1/L2)",
                         f, members[0].line)
                flagged_icon = True
            elif tag_count >= 3 and not has_svg and not flagged_uniform \
                    and members[0].parent.tag not in ("ul", "ol", "nav", "tr", "thead", "tbody"):
                rep.warn("uniform-cards", f"{len(members)} structurally identical cards "
                         f"({s[:60]}) — vary weight by importance (L2)",
                         f, members[0].line)
                flagged_uniform = True


def check_pill_badge(rep, f, css, tree):
    pill_classes = set()
    for m in re.finditer(r"\.([\w-]+)[^{}]*\{[^}]*border-radius\s*:\s*(?:9{3,}px|50rem|100px)", css, re.I):
        pill_classes.add(m.group(1).lower())
    if not pill_classes:
        return
    h1 = next((n for n in tree.all_nodes if n.tag == "h1"), None)
    if not h1:
        return
    for n in tree.all_nodes:
        if n.order >= h1.order:
            break
        if in_chrome(n):
            continue  # nav/header pills (phone CTAs, menu chips) are not badges
        txt = n.text()
        if not txt or len(txt) >= 40 or PHONE_RE.match(txt):
            continue
        cls = set(n.classes().split())
        if cls & pill_classes:
            rep.warn("pill-badge", f'pill-shaped "{txt[:30]}" before the H1 — '
                     "the badge-above-headline tell (L3)", f, n.line)
            return


def subtree_has(node, tags):
    if node.tag in tags:
        return True
    return any(subtree_has(c, tags) for c in node.children)


def check_split_hero(rep, f, tree, home_ctx):
    """WARN on the reflexive two-column text|visual hero (L8) — unless the
    design-lock consciously declares topology: split."""
    lock = home_ctx.get("lock") or ""
    if re.search(r"topology:[^\n]*split", lock, re.I):
        return
    h1 = next((n for n in tree.all_nodes if n.tag == "h1"), None)
    if not h1:
        return
    block = h1
    while block.parent is not None and block.parent.tag not in ("body", "#root", "main"):
        block = block.parent
    kids = [c for c in block.children if c.tag not in ("script", "style")]
    if len(kids) != 2:
        return
    visual_tags = {"svg", "img", "picture", "video", "canvas"}
    a_has_h1, b_has_h1 = subtree_has(kids[0], {"h1"}), subtree_has(kids[1], {"h1"})
    a_vis, b_vis = subtree_has(kids[0], visual_tags), subtree_has(kids[1], visual_tags)
    if (a_has_h1 and b_vis and not a_vis) or (b_has_h1 and a_vis and not b_vis):
        rep.warn("split-hero", "hero is the two-column text|visual split and the "
                 "design-lock topology doesn't declare it — monoculture tell (L8)",
                 f, block.line)


# ---------------------------------------------------------------- motion

def check_motion_degradation(rep, f, html_text, css, js):
    has_reveals = bool(re.search(r"IntersectionObserver", js)) or \
        bool(re.search(r"\.js\s+[^{}]*\{[^}]*opacity\s*:\s*0", css))
    if not has_reveals:
        if re.search(r"@keyframes|animation\s*:", css, re.I) and \
                "prefers-reduced-motion" not in css:
            rep.warn("reduced-motion", "animations present but no "
                     "prefers-reduced-motion query (A3)", f)
        return
    gated = re.search(r"classList\.add\(\s*['\"]js['\"]\s*\)", js) or \
        re.search(r"<html[^>]*class=[\"'][^\"']*\bjs\b", html_text) or \
        re.search(r"remove\(\s*['\"]no-js['\"]\s*\)", js)
    if not gated:
        rep.fail("degradation-jsgate", "reveal system without .js gating — no-JS "
                 "visitors get hidden content (A3, triple rule 1/3)", f)
    if not re.search(r"setTimeout[\s\S]{0,300}?(reveal|visible|show)", js, re.I):
        rep.fail("degradation-failsafe", "reveal system without a reveal-all failsafe "
                 "timeout (A3, triple rule 2/3)", f)
    if "prefers-reduced-motion" not in css and "prefers-reduced-motion" not in js:
        rep.fail("degradation-rm", "reveal system without prefers-reduced-motion "
                 "handling (A3, triple rule 3/3)", f)


# ---------------------------------------------------------------- compliance

def css_var_map(css):
    return {m.group(1): m.group(2).strip()
            for m in re.finditer(r"--([\w-]+)\s*:\s*([^;}]+)", css)}


def resolve_color(value, vars_, depth=0):
    """Resolve a CSS color value to (r,g,b) or None. Handles #hex, rgb()/rgba()
    and one/two-level var() indirection."""
    if depth > 3 or not value:
        return None
    value = value.strip()
    m = re.match(r"var\(\s*--([\w-]+)\s*(?:,([^)]+))?\)", value)
    if m:
        target = vars_.get(m.group(1))
        return resolve_color(target if target else (m.group(2) or ""), vars_, depth + 1)
    m = HEX_RE.search(value)
    if m:
        h = norm_hex(m.group(1))
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    m = re.match(r"rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)", value)
    if m:
        return tuple(int(m.group(i)) for i in (1, 2, 3))
    return None


def wcag_ratio(c1, c2):
    def lum(rgb):
        def chan(v):
            v /= 255.0
            return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
        r, g, b = (chan(v) for v in rgb)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    l1, l2 = sorted((lum(c1), lum(c2)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def body_rule_value(css, prop):
    for m in re.finditer(r"(?:^|[}\s;])(?:html\s*,\s*)?body[^{},]*\{([^}]*)\}", css, re.I):
        vm = re.search(rf"(?<![\w-]){prop}\s*:\s*([^;}}]+)", m.group(1), re.I)
        if vm:
            return vm.group(1).strip()
    return None


def check_contrast(rep, f, css):
    vars_ = css_var_map(css)
    fg = resolve_color(body_rule_value(css, "color"), vars_)
    bg = resolve_color(body_rule_value(css, "background-color") or
                       body_rule_value(css, "background"), vars_)
    if fg and bg:
        ratio = wcag_ratio(fg, bg)
        if ratio < 4.5:
            rep.fail("contrast", f"body text contrast {ratio:.2f}:1 < 4.5:1 (WCAG AA) "
                     f"— fg rgb{fg} on bg rgb{bg}", f)
    # Muted/secondary text vars vs the page background.
    if bg:
        for name, val in vars_.items():
            if not re.search(r"(text|ink|muted|secondary|fg)", name, re.I):
                continue
            col = resolve_color(val, vars_)
            if col and col != bg:
                ratio = wcag_ratio(col, bg)
                if ratio < 4.5:
                    rep.warn("contrast", f"--{name} is {ratio:.2f}:1 against the body "
                             "background — below AA for normal text; reserve for "
                             "large/decorative text only", f)


def check_legibility(rep, f, css):
    fs = body_rule_value(css, "font-size")
    if fs:
        m = re.match(r"([\d.]+)\s*(px|rem|em)", fs)
        if m:
            v, unit = float(m.group(1)), m.group(2)
            if (unit == "px" and v < 16) or (unit in ("rem", "em") and v < 1):
                rep.warn("legibility", f"body font-size {fs} < 16px — small base type "
                         "hurts readability on phones", f)
    lh = body_rule_value(css, "line-height")
    if lh:
        m = re.match(r"([\d.]+)\s*(px)?\s*$", lh.strip())
        if m:
            v = float(m.group(1))
            if m.group(2) == "px":
                fsv = 16.0
                if fs:
                    fm = re.match(r"([\d.]+)\s*px", fs)
                    if fm:
                        fsv = float(fm.group(1))
                v = v / fsv
            if v < 1.4:
                rep.warn("legibility", f"body line-height {lh} < 1.4 — cramped "
                         "paragraphs hurt readability", f)


def has_cookie_banner(tree, html_text):
    if re.search(r"(?:class|id)=[\"'][^\"']*(cookie|consent)", html_text, re.I):
        return True
    return bool(re.search(r"politica-cookies|política de cookies", html_text, re.I))


def check_third_party(rep, f, html_text, tree):
    banner = has_cookie_banner(tree, html_text)
    found_trackers = [h for h in TRACKER_HOSTS if h in html_text]
    if found_trackers and not banner:
        rep.fail("gdpr-cookies", "tracking scripts without a cookie consent banner: "
                 + ", ".join(found_trackers) +
                 " — banner + politica-cookies required (PLAYBOOK step 7)", f)
    for host, fix in EMBED_HOSTS:
        if host in html_text and "youtube-nocookie" not in html_text.split(host)[0][-20:]:
            if not banner:
                rep.warn("gdpr-cookies", f"{host} embed sets cookies — {fix}", f)


def check_gdpr_forms(rep, f, tree, html_text):
    for form in (n for n in tree.all_nodes if n.tag == "form"):
        personal = False
        has_consent = False
        stack = [form]
        while stack:
            n = stack.pop()
            stack.extend(n.children)
            if n.tag in ("input", "textarea"):
                t = (n.attrs.get("type") or "").lower()
                ident = ((n.attrs.get("name") or "") + (n.attrs.get("id") or "")).lower()
                if t in ("email", "tel") or re.search(r"email|telefono|phone|nombre", ident):
                    personal = True
                if t == "checkbox":
                    has_consent = True
        if not personal:
            continue
        has_privacy = bool(re.search(r"privacidad", html_text, re.I))
        if not has_privacy:
            rep.fail("gdpr-form", "form collects personal data but the page never "
                     "links a política de privacidad (PLAYBOOK step 7)", f, form.line)
        if not has_consent:
            rep.fail("gdpr-form", "form collects personal data without a consent "
                     "checkbox — RGPD requires explicit consent", f, form.line)


def check_booking(rep, f, tree):
    for n in (x for x in tree.all_nodes if "data-booking" in x.attrs):
        live = False
        stack = [n]
        while stack:
            c = stack.pop()
            stack.extend(c.children)
            href = (c.attrs.get("href") or "") if c.tag == "a" else ""
            if "wa.me" in href or href.startswith("tel:") or "api.whatsapp.com" in href:
                live = True
                break
        if not live:
            rep.fail("dead-booking", "booking widget (data-booking) has no live wa.me/"
                     "tel: handoff — a scheduler that goes nowhere destroys trust "
                     "(booking-contact.md)", f, n.line)


# ---------------------------------------------------------------- misc

def check_misc(rep, f, html_text, tree, role, home_ctx):
    if not re.search(r'<meta[^>]+name=["\']robots["\'][^>]+noindex', html_text, re.I):
        rep.warn("noindex", "no noindex meta — required for demo pages "
                 "(skip for production sites)", f)
    if re.search(r'<script[^>]+type=["\']module["\']', html_text, re.I):
        rep.warn("module-script", "ES module script — breaks file:// review and "
                 "complicates cache busting on cheap hosts", f)
    missing_alt = [n for n in tree.all_nodes if n.tag == "img" and "alt" not in n.attrs]
    if missing_alt:
        rep.warn("img-alt", f"{len(missing_alt)} <img> without alt "
                 f"(first at line {missing_alt[0].line})", f)
    html_node = next((n for n in tree.all_nodes if n.tag == "html"), None)
    lang = (html_node.attrs.get("lang") or "") if html_node else ""
    if not lang.lower().startswith("es"):
        rep.warn("lang", f'html lang="{lang or "(missing)"}" — Spanish sites declare '
                 'lang="es" (screen readers pronounce the content wrong otherwise)', f)

    # Site-level artifacts live on the home page only (audit finding 4):
    # subpages match the home's lock, they don't re-declare it.
    if role == "home":
        lock = next((c for c in tree.comments if "design-lock" in c), None)
        if lock is None:
            rep.fail("design-lock", "missing <!-- design-lock --> header comment — "
                     "decisions were not pinned before code (workflow step 2)", f)
        elif "topology:" not in lock:
            rep.fail("design-lock", "design-lock has no topology: field — layout was "
                     "not chosen, it defaulted (L8; pick from the menu in "
                     "directions.md)", f)
        if not any("data-signature" in n.attrs for n in tree.all_nodes):
            rep.fail("signature-missing", "no element carries data-signature — the "
                     "lock's signature element doesn't exist in the page "
                     "(signature test)", f)
    # Subpages don't re-declare the lock; the home's FAIL is the site's signal.


# ---------------------------------------------------------------- runner

def collect_files(paths):
    html, css, roots = [], [], []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            roots.append(path.resolve())
            html += sorted(path.rglob("*.html"))
            css += sorted(path.rglob("*.css"))
        elif path.suffix == ".html":
            roots.append(path.resolve().parent)
            html.append(path)
        elif path.suffix == ".css":
            css.append(path)
    return html, css, roots


def file_role(hf, roots):
    p = hf.resolve()
    if p.name == "index.html" and p.parent in roots:
        return "home"
    return "subpage"


def home_context(html_files, roots):
    """Per scan root: the home's lock comment, font set and brand override.

    When a subpage is spot-checked alone (its index.html isn't in the scanned
    set), probe the root's index.html on disk so the subpage still inherits the
    site context instead of being judged orphan."""
    ctx = {}
    homes = [hf for hf in html_files if file_role(hf, roots) == "home"]
    for root in roots:
        if not any(h.resolve().parent == root for h in homes):
            probe = root / "index.html"
            if probe.exists():
                homes.append(probe)
    for hf in homes:
        text = hf.read_text(encoding="utf-8", errors="replace")
        tree = TreeBuilder()
        tree.feed(text)
        css = "\n".join(tree.styles)
        lock = next((c for c in tree.comments if "design-lock" in c), None)
        loaded = set(google_families(text))
        declared, _ = families_in_css(css)
        override = ""
        if lock:
            m = re.search(r"brand-override:\s*([^\n]+)", lock, re.I)
            if m:
                override = m.group(1)
        ctx[hf.resolve().parent] = {
            "lock": lock,
            "families": (loaded | declared) - GENERIC_FAMILIES,
            "override": override,
            "checked_home": True,
        }
    return ctx


def ctx_for(hf, roots, ctx):
    p = hf.resolve().parent
    while True:
        if p in ctx:
            return ctx[p]
        if p in roots or p.parent == p:
            return {"lock": None, "families": set(), "override": "",
                    "checked_home": p in ctx}
        p = p.parent


def main():
    ap = argparse.ArgumentParser(description="Detect AI tells in generated sites")
    ap.add_argument("paths", nargs="+", help="directories or .html/.css files")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    html_files, css_files, roots = collect_files(args.paths)
    if not html_files:
        print("No HTML files found.", file=sys.stderr)
        return 2

    shared_css = ""
    for cf in css_files:
        try:
            shared_css += "\n" + cf.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            print(f"warning: cannot read {cf}: {e}", file=sys.stderr)

    site_ctx = home_context(html_files, roots)

    rep = Report()
    for hf in html_files:
        text = hf.read_text(encoding="utf-8", errors="replace")
        tree = TreeBuilder()
        tree.feed(text)
        inline_styles = " ".join(
            n.attrs.get("style", "") for n in tree.all_nodes if n.attrs.get("style"))
        css = "\n".join(tree.styles) + "\n" + shared_css + "\n" + inline_styles
        js = "\n".join(tree.scripts)
        role = file_role(hf, roots)
        hctx = ctx_for(hf, roots, site_ctx)

        check_fonts(rep, hf, text, css, role, hctx)
        check_color(rep, hf, css, text, hctx)
        check_radius(rep, hf, css)
        check_uppercase_labels(rep, hf, css, tree)
        check_text_content(rep, hf, tree)
        check_card_grids(rep, hf, tree)
        check_pill_badge(rep, hf, css, tree)
        if role == "home":
            check_split_hero(rep, hf, tree, hctx)
        check_motion_degradation(rep, hf, text, css, js)
        check_contrast(rep, hf, css)
        check_legibility(rep, hf, css)
        check_third_party(rep, hf, text, tree)
        check_gdpr_forms(rep, hf, tree, text)
        check_booking(rep, hf, tree)
        check_misc(rep, hf, text, tree, role, hctx)

    if args.json:
        print(json.dumps([
            {"severity": s, "check": c, "message": m, "file": fl, "line": ln}
            for s, c, m, fl, ln in rep.items], ensure_ascii=False, indent=2))
    else:
        by_file = {}
        for item in rep.items:
            by_file.setdefault(item[3], []).append(item)
        for fl, items in by_file.items():
            print(f"\n{fl}")
            for sev, check, msg, _, ln in items:
                mark = "✗ FAIL" if sev == "FAIL" else "⚠ WARN"
                loc = f" (line {ln})" if ln else ""
                print(f"  {mark} {check}: {msg}{loc}")
        nf, nw = len(rep.fails), len(rep.items) - len(rep.fails)
        verdict = "NOT SHIPPABLE" if nf else "shippable (review warnings)"
        print(f"\nSummary: {nf} FAIL, {nw} WARN across {len(html_files)} HTML file(s) → {verdict}")

    return 1 if rep.fails else 0


if __name__ == "__main__":
    sys.exit(main())
