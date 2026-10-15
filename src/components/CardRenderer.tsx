"use client";

import type { CardSpec } from "@/lib/types";
import { CardVisual } from "./CardVisual";
import { Reveal } from "./Reveal";
import { Rich } from "./Rich";
import { Tex } from "./Tex";
import { WorkedExample } from "./WorkedExample";

/* ------------------------------------------------------------------ */
/* The one and only card renderer.                                     */
/*                                                                     */
/* A CardSpec is typed data; every pixel below is owned by this file.  */
/* There is deliberately NO per-card CSS. A card's only identity knob  */
/* is `accent`, mapped here to a fixed palette — which is exactly why  */
/* cards come out consistent instead of each inventing its own look.   */
/* ------------------------------------------------------------------ */

const ACCENTS = {
  pine: { ink: "var(--color-pine)", deep: "var(--color-pine-deep)", soft: "var(--color-pine-soft)" },
  blood: { ink: "var(--color-blood)", deep: "#8f1f1f", soft: "#fbe3e3" },
  cobalt: { ink: "var(--color-cobalt)", deep: "#155fa0", soft: "#e0eefb" },
  ember: { ink: "var(--color-ember)", deep: "#b8430a", soft: "var(--color-ember-soft)" },
  gold: { ink: "#b8770f", deep: "#8a5a00", soft: "#fdf0d8" },
} as const;

function SectionHead({
  kicker,
  title,
  accent,
}: {
  kicker: string;
  title: string;
  accent: (typeof ACCENTS)[keyof typeof ACCENTS];
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3">
        <span
          className="font-mono text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: accent.ink }}
        >
          {kicker}
        </span>
        <span className="h-px flex-1" style={{ background: "var(--card-line)" }} />
      </div>
      <h2 className="mt-2 text-[1.7rem] font-semibold leading-tight tracking-tight sm:text-[2rem]">
        {title}
      </h2>
    </div>
  );
}

export function CardRenderer({ spec }: { spec: CardSpec }) {
  const accent = ACCENTS[spec.accent] ?? ACCENTS.pine;

  return (
    <article className="overflow-hidden rounded-[24px] border border-[color:var(--card-line)] bg-[color:var(--card-surface)] shadow-[0_24px_70px_-40px_rgba(19,42,50,0.5)]">
      {/* accent rule — the card's single identity mark */}
      <div className="h-1.5" style={{ background: accent.ink }} />

      {/* ---------------- HERO ---------------- */}
      <header className="px-6 pb-8 pt-8 sm:px-10 sm:pt-10">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider"
            style={{ background: accent.soft, color: accent.deep }}
          >
            {spec.metaAccent}
          </span>
          {spec.metaNeutral.map((chip, i) => (
            <span
              key={i}
              className="rounded-full border border-[color:var(--card-line)] bg-[color:var(--paper2)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[color:var(--ink-soft)]"
            >
              {chip}
            </span>
          ))}
        </div>

        <h1 className="mt-5 text-[2.2rem] font-semibold leading-[1.02] tracking-tight sm:text-[3rem]">
          {spec.heading[0]}
          <br />
          <span style={{ color: accent.ink }}>{spec.heading[1]}</span>
        </h1>

        <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
          {spec.pathSub}
        </p>

        <p className="mt-5 max-w-3xl text-[1.05rem] leading-relaxed text-[color:var(--ink-soft)]">
          <Rich text={spec.lead} />
        </p>
      </header>

      {/* ---------------- VISUAL ---------------- */}
      {spec.visual.kind !== "none" && (
        <section className="border-t border-[color:var(--card-line)] bg-[color:var(--paper)] px-6 py-8 sm:px-10">
          <Reveal>
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[1.35rem] font-semibold tracking-tight">
                {spec.visual.heading}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {spec.visual.chips.map((chip, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-[color:var(--card-line)] bg-[color:var(--card-surface)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[color:var(--ink-soft)]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <p className="mb-4 max-w-3xl text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
              <Rich text={spec.visual.intro} />
            </p>
            <CardVisual kind={spec.visual.kind} />
            <p className="mt-3 text-[13.5px] leading-relaxed text-[color:var(--ink-faint)]">
              <Rich text={spec.visual.caption} />
            </p>
          </Reveal>
        </section>
      )}

      {/* ---------------- FORMAL ---------------- */}
      <section className="border-t border-[color:var(--card-line)] px-6 py-8 sm:px-10">
        <Reveal>
          <SectionHead kicker="the formal part" title={spec.formal.heading} accent={accent} />

          {/* the invariant */}
          <div
            className="rounded-xl border-l-4 px-5 py-4"
            style={{ borderColor: accent.ink, background: accent.soft }}
          >
            <p
              className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ color: accent.deep }}
            >
              {spec.formal.invariant.label}
            </p>
            <p className="mt-1 text-[1.15rem] font-semibold leading-snug">
              {spec.formal.invariant.headline}
            </p>
          </div>

          {/* ledger */}
          <div className="mt-5 rounded-xl border border-[color:var(--card-line)] bg-[color:var(--paper)] p-5">
            <Tex block className="text-[1.05rem]">
              {spec.formal.ledger.latex}
            </Tex>
            <p className="mt-3 text-[14.5px] leading-relaxed text-[color:var(--ink-soft)]">
              <Rich text={spec.formal.ledger.note} />
            </p>
          </div>

          <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
            <Rich text={spec.formal.variablePart} />
          </p>

          {/* moves */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {spec.formal.moves.map((move, i) => (
              <div
                key={i}
                className="flex flex-col rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)] p-5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-md font-mono text-[12px] font-bold"
                    style={{ background: accent.soft, color: accent.deep }}
                  >
                    {i + 1}
                  </span>
                  <h3 className="font-semibold text-[1.05rem]">{move.name}</h3>
                </div>
                <p className="mt-1.5 text-[13px] font-semibold uppercase tracking-wide text-[color:var(--ink-faint)]">
                  {move.trigger}
                </p>
                <div className="mt-3 rounded-lg bg-[color:var(--paper)] px-3 py-2.5">
                  <Tex block>{move.formula}</Tex>
                </div>
                <p className="mt-3 text-[14.5px] leading-relaxed text-[color:var(--ink-soft)]">
                  <Rich text={move.body} />
                </p>
                <p className="mt-3 border-t border-[color:var(--card-line)] pt-3 text-[13.5px] leading-relaxed">
                  <span className="font-bold" style={{ color: accent.ink }}>
                    Check:{" "}
                  </span>
                  <Rich text={move.check} />
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* trick + checks + scope */}
      <section className="border-t border-[color:var(--card-line)] bg-[color:var(--paper)] px-6 py-8 sm:px-10">
        <Reveal>
          <div
            className="rounded-xl border-2 border-dashed p-5"
            style={{ borderColor: accent.ink }}
          >
            <p
              className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ color: accent.ink }}
            >
              {spec.formal.trick.label}
            </p>
            <p className="mt-1.5 text-[15px] leading-relaxed">
              <Rich text={spec.formal.trick.body} />
            </p>
          </div>

          <div className="mt-6">
            <h3 className="text-[1.15rem] font-semibold">{spec.formal.checks.title}</h3>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {spec.formal.checks.items.map((item, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)] p-4"
                >
                  <Tex block className="text-[0.98rem]">
                    {item.latex}
                  </Tex>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-[color:var(--ink-soft)]">
                    <Rich text={item.note} />
                  </p>
                </li>
              ))}
            </ul>
            {spec.formal.checks.after && (
              <p className="mt-3 text-[14.5px] leading-relaxed text-[color:var(--ink-soft)]">
                <Rich text={spec.formal.checks.after} />
              </p>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)] p-5">
            <h3 className="text-[1.05rem] font-semibold">{spec.formal.scope.title}</h3>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-[color:var(--ink-soft)]">
              <Rich text={spec.formal.scope.body} />
            </p>
          </div>
        </Reveal>
      </section>

      {/* ---------------- RAMP ---------------- */}
      <section className="border-t border-[color:var(--card-line)] px-6 py-8 sm:px-10">
        <Reveal>
          <SectionHead kicker="practice ramp" title={spec.ramp.heading} accent={accent} />
          <p className="mb-5 max-w-3xl text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
            <Rich text={spec.ramp.intro} />
          </p>
          <div className="space-y-4">
            {spec.ramp.examples.map((example, i) => (
              <WorkedExample
                key={i}
                index={i + 1}
                level={example.level}
                source={example.source}
                title={example.title}
                prompt={<Rich text={example.prompt} />}
                steps={example.steps.map((step, j) => (
                  <Rich key={j} text={step} />
                ))}
                takeaway={<Rich text={example.takeaway} />}
              />
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="px-6 py-8 sm:px-10" style={{ background: "var(--color-deep)" }}>
        <h2 className="text-[1.4rem] font-semibold tracking-tight text-mist">
          {spec.cta.heading}
        </h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[color:var(--color-mist-soft)]">
          <Rich text={spec.cta.body} />
        </p>
      </section>
    </article>
  );
}
