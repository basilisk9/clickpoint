/* ------------------------------------------------------------------ */
/* Card host CSS — the MACRO aesthetic, as an injectable string.      */
/*                                                                    */
/* The iframe host injects this into the card document head:         */
/*   1. <link> tags: /fonts/fonts.css (self-hosted) + katex.min.css   */
/*   2. <style>: THIS FILE (base reset + macro classes), unlayered    */
/*   3. <style>: the AI's micro CSS, wrapped in `@layer ai { ... }`  */
/*                                                                    */
/* Cascade-law, by design: unlayered CSS beats layered CSS regardless */
/* of specificity. This file stays UNLAYERED; the AI's CSS is        */
/* wrapped in a declared layer at injection time. So the model can   */
/* style anything the macro does not cover — but it can never        */
/* override a macro class, even with !important. The macro is the     */
/* law; the micro is free. The iframe wall already keeps all of it   */
/* from touching the app outside.                                     */
/* ------------------------------------------------------------------ */

export const CARD_CSS = String.raw`
:root {
  --paper: #f2f5f3;
  --paper2: #e7edea;
  --card: #fbfdfc;
  --ink: #132a32;
  --ink-soft: #4c656e;
  --ink-faint: #8299a1;
  --line: #ccd9d3;
  --pine: #0e7b6c;
  --pine-deep: #0a5c51;
  --pine-soft: #d9e9e3;
  --ember: #e8590c;
  --ember-soft: #fbe6d7;
  --cobalt: #1c7ed6;
  --blood: #c92a2a;
  --gold: #f0a020;
  --deep: #0d2029;
  --deep2: #123039;
  --deep-line: #264854;
  --mist: #e9f2ef;
  --mist-soft: #9db8b1;

  /* Type. Bricolage Grotesque carries display; Instrument Sans body;
     JetBrains Mono numbers, kickers, readouts. */
  --font-display: "Bricolage Grotesque", "Instrument Sans", system-ui, sans-serif;
  --font-body: "Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  /* Accent slot. The card picks ONE accent family at generation time
     and sets this to pine | blood | cobalt | ember | gold. Every macro
     class below reads from these, so one attribute recolors the card. */
  --accent: var(--pine);
  --accent-deep: var(--pine-deep);
  --accent-soft: var(--pine-soft);

  /* Layout rhythm — one measure so cards share a vertical cadence. */
  --band-pad: 80px;
  --measure: 1024px;
}

/* ---------------- base reset (~20 lines, pre-seeded) ---------------- */

*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--font-body);
  color: var(--ink);
  background-color: var(--paper);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
img, canvas, svg, video { display: block; max-width: 100%; }
button { cursor: pointer; font: inherit; color: inherit; }
input, select, textarea { font: inherit; color: inherit; }
h1, h2, h3, h4, h5, h6 { margin: 0 0 0.4em; line-height: 1.05; }
p, ol, ul, figure, blockquote { margin: 0 0 1em; }
a { color: inherit; }
::selection { background: var(--pine-soft); color: var(--pine-deep); }

/* ---------------- KaTeX (the host renders math) ---------------- */

.katex { font-size: 1.07em; }
.katex-display {
  margin: 0.55em 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.1em 0;
}

/* ------------------------------------------------------------------ */
/* MACRO — the hardcoded aesthetic. Ported from the reference design  */
/* system. The model COMPOSES cards from these classes; it never      */
/* restyles them. Structure inside each element is the model's.        */
/* ------------------------------------------------------------------ */

/* ---------------- page bands ---------------- */

/* The graph-paper surface lives on the HOST PAGE, not inside the card:
   the card is full-bleed and transparent, so the page's single continuous
   grid shows through and the pattern never seams at the iframe edge.
   The dark band is the one surface the card may still paint itself. */
.graph-paper {
  background-color: transparent;
  background-image: none;
}

/* Section bands carry their own measurement. The model composes a card
   from these wrappers and never writes layout for them, so the band itself
   must inset its content: full-bleed background, centered measure, real
   gutters. Without this, text runs edge to edge and the card reads as a
   broken full-width export.
   max() keeps a minimum gutter on narrow screens; the calc centers the
   measure on wide ones. */
.graph-paper,
.graph-paper-dark {
  padding: 80px max(32px, calc((100% - 1024px) / 2));
}
.graph-paper > *,
.graph-paper-dark > * {
  max-width: 1024px;
  margin-left: auto;
  margin-right: auto;
}

/* The signature: the dark formalization band. Wearing graph-paper-dark
   sets the surface AND every text class inside is expected to be used
   (mist heads, mist-soft body) — the band classes travel together with
   their text pairings so pale-on-pale is impossible by construction. */
.graph-paper-dark {
  background-color: var(--deep);
  background-image:
    linear-gradient(to right, rgba(233, 242, 239, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(233, 242, 239, 0.05) 1px, transparent 1px);
  background-size: 26px 26px;
  color: var(--mist);
  /* The dark band is the one surface that differs from the page, so it is
     the one that needs an edge: rounded corners keep it reading as a panel
     set into the document rather than a broken full-bleed stripe. */
  border-radius: 20px;
}
.graph-paper-dark ::selection { background: var(--pine-deep); color: var(--mist); }


/* The opening block: the card's own title furniture lives in the first
   band, so it inherits the band gutter. No extra measure here — it already
   sits inside the 1024px column. */
.card-eyebrow,
.card-heading,
.card-lead {
  max-width: 46rem;
}

/* ---------------- movement ---------------- */

.movement-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.movement-tag {
  display: inline-block;
  border-radius: 6px;
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  background: var(--ink);
  color: var(--mist);
}
.graph-paper-dark .movement-tag {
  background: var(--accent);
  color: var(--deep);
}
.movement-rule {
  height: 1px;
  flex: 1;
  background: var(--line);
}
.graph-paper-dark .movement-rule { background: var(--deep-line); }

.movement-heading {
  margin-top: 16px;
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.01em;
}
@media (min-width: 640px) { .movement-heading { font-size: 2.5rem; } }

.movement-intro {
  margin-top: 12px;
  max-width: 48rem;
  font-size: 16px;
  line-height: 1.65;
  color: var(--ink-soft);
}
.graph-paper-dark .movement-intro { color: var(--mist-soft); }

/* ---------------- card header ---------------- */

.card-eyebrow {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--accent);
}
.card-heading {
  margin-top: 12px;
  font-family: var(--font-display);
  font-size: 2.6rem;
  font-weight: 800;
  line-height: 0.98;
  letter-spacing: -0.015em;
}
@media (min-width: 640px) { .card-heading { font-size: 3.4rem; } }
.card-lead {
  margin-top: 20px;
  max-width: 36rem;
  font-size: 17px;
  line-height: 1.65;
  color: var(--ink-soft);
}

.meta-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-soft);
}
.meta-chip {
  border: 1px solid var(--line);
  background: var(--card);
  border-radius: 8px;
  padding: 8px 12px;
}
.meta-chip-accent {
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: var(--accent-soft);
  color: var(--accent-deep);
  border-radius: 8px;
  padding: 8px 12px;
}

/* ---------------- formalization (Movement II, dark surface) -------- */

.formal-box {
  border: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: 12px;
  background: var(--deep2);
  color: var(--mist);
  padding: 32px;
}
.formal-label {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--accent);
}
.graph-paper-dark .formal-label { color: var(--accent); }
.formal-headline {
  margin-top: 12px;
  font-family: var(--font-display);
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.2;
}
.formal-note {
  margin-top: 8px;
  max-width: 36rem;
  font-size: 14px;
  line-height: 1.6;
  color: var(--mist-soft);
}
.formal-varpart {
  margin-top: 16px;
  border-radius: 8px;
  background: var(--deep);
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--mist-soft);
}

/* dark-band utility pairings — text classes that are only legal on the
   dark surface. Using one without a .graph-paper-dark ancestor is a
   visible bug the contract forbids, and verification checks. */
.on-dark { color: var(--mist); }
.on-dark-soft { color: var(--mist-soft); }
.on-dark-line { border-color: var(--deep-line); }
.on-dark-box { background: var(--deep2); border: 1px solid var(--deep-line); border-radius: 12px; }

/* ---------------- moves ---------------- */

.move-row {
  display: grid;
  gap: 16px;
  padding: 24px 0;
  border-top: 1px solid var(--deep-line);
}
@media (min-width: 768px) {
  .move-row { grid-template-columns: 64px 1fr 1.2fr; gap: 24px; }
}
.move-num {
  font-family: var(--font-display);
  font-size: 2.4rem;
  font-weight: 800;
  color: color-mix(in srgb, var(--accent) 80%, transparent);
}
.move-name {
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
}
.move-trigger-label {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--mist-soft);
}
.move-trigger {
  margin-top: 4px;
  font-size: 14.5px;
  font-style: italic;
  line-height: 1.55;
  color: color-mix(in srgb, var(--mist) 90%, transparent);
}
.move-formula { font-size: 1.25rem; }
.move-body {
  font-size: 15px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--mist) 95%, transparent);
}
.move-check {
  margin-top: 12px;
  border-radius: 8px;
  border: 1px solid var(--deep-line);
  background: var(--deep2);
  padding: 10px 14px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--mist-soft);
}

/* ---------------- trick / scope / checks panels ---------------- */

.trick-panel {
  border-left: 4px solid var(--gold);
  border-radius: 12px;
  background: var(--deep2);
  padding: 28px;
}
.trick-label {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--gold);
}
.trick-body {
  margin-top: 12px;
  font-size: 15.5px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--mist) 95%, transparent);
}

.scope-panel {
  border: 1px solid color-mix(in srgb, var(--blood) 50%, transparent);
  border-radius: 12px;
  background: var(--deep2);
  padding: 24px;
}
.scope-label {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--blood);
}
.scope-body {
  margin-top: 16px;
  font-size: 14.5px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--mist) 90%, transparent);
}
.scope-fails {
  margin-top: 12px;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--mist-soft);
}

.checks-panel {
  border: 1px solid var(--deep-line);
  border-radius: 12px;
  background: var(--deep2);
  padding: 24px;
}
.checks-label {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--pine);
}
.checks-item { margin-top: 12px; }
.checks-note {
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--mist-soft);
}
.checks-after {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--deep-line);
  color: color-mix(in srgb, var(--mist) 90%, transparent);
}

/* ---------------- worked examples (the ramp) ---------------- */

.example-card {
  overflow: hidden;
  border: 2px solid rgba(19, 42, 50, 0.12);
  border-radius: 12px;
  background: var(--card);
  box-shadow: 0 8px 28px -20px rgba(19, 42, 50, 0.4);
}
.example-bar {
  height: 6px;
  background: var(--accent);
}
.example-body { padding: 24px; }
.example-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
}
.example-index { color: var(--ink-faint); }
.example-level {
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  background: var(--accent-soft);
  color: var(--accent-deep);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.example-source {
  border: 1px solid var(--line);
  background: var(--paper2);
  color: var(--ink-soft);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 600;
}
.example-title {
  margin-top: 10px;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.2;
}
.example-prompt {
  margin-top: 8px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--ink-soft);
}
.example-step {
  display: flex;
  gap: 12px;
  border: 1px solid var(--line);
  background: var(--paper);
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 14.5px;
  line-height: 1.6;
}
.example-step-num {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-faint);
}
.example-takeaway {
  border-left: 4px solid var(--pine);
  background: color-mix(in srgb, var(--pine-soft) 60%, transparent);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.6;
}

/* ---------------- CTA ---------------- */

.cta-box {
  overflow: hidden;
  border: 2px solid var(--ink);
  border-radius: 12px;
  background: var(--ink);
  color: var(--mist);
  padding: 32px;
}
.cta-kicker {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--gold);
}
.cta-heading {
  margin-top: 8px;
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
  text-align: center;
}
.cta-body {
  max-width: 28rem;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--mist-soft);
  text-align: center;
}

/* ---------------- motion (named, per the reference) ---------------- */

@keyframes cpPulseRing {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--pine) 40%, transparent); }
  75% { box-shadow: 0 0 0 18px color-mix(in srgb, var(--pine) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--pine) 0%, transparent); }
}
.pulse-ring { animation: cpPulseRing 1.9s ease-out infinite; }

@keyframes cpSlideUp {
  from { transform: translateY(110%); }
  to { transform: translateY(0); }
}
.slide-up { animation: cpSlideUp 0.35s cubic-bezier(0.22, 0.9, 0.3, 1); }

@keyframes cpPopIn {
  from { transform: scale(0.55); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.pop-in { animation: cpPopIn 0.32s cubic-bezier(0.22, 0.9, 0.3, 1.35); }

@keyframes cpShakeX {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-6px); }
  40%, 60% { transform: translateX(6px); }
}
.shake { animation: cpShakeX 0.5s ease; }

@keyframes cpFloaty {
  0%, 100% { transform: translateY(-3px) rotate(var(--tilt, 0deg)); }
  50% { transform: translateY(4px) rotate(var(--tilt, 0deg)); }
}
.floaty { animation: cpFloaty 5.5s ease-in-out infinite; }

@keyframes cpDashDraw {
  from { stroke-dashoffset: 1400; }
  to { stroke-dashoffset: 0; }
}
.dash-draw {
  stroke-dasharray: 1400;
  animation: cpDashDraw 2.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

/* ---------------- sim furniture (macro shell, micro interior) ------- */
/* The panel shell is macro; everything INSIDE the sim — its controls,
   readouts, canvas layout — is the model's micro territory. These
   classes just guarantee sims sit in the card like native citizens. */

.sim-panel {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--card);
  padding: 16px;
}
.graph-paper-dark .sim-panel {
  border-color: var(--deep-line);
  background: var(--deep2);
}
.sim-canvas {
  display: block;
  width: 100%;
  height: auto;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.sim-caption {
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--ink-faint);
}
.graph-paper-dark .sim-caption { color: var(--mist-soft); }

/* ---------------- controls ---------------- */

input[type="range"] { accent-color: var(--pine); }
`;
