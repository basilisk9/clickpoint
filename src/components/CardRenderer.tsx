"use client";

import { Fragment } from "react";
import type { CardSection, CardSpec } from "@/lib/types";
import { sectionsOf } from "@/lib/card";
import { CardVisual } from "./CardVisual";
import { Reveal } from "./Reveal";
import { Rich } from "./Rich";
import { Tex } from "./Tex";
import { WorkedExample } from "./WorkedExample";

/* ------------------------------------------------------------------ */
/* The one and only card renderer.                                     */
/*                                                                     */
/* A CardSpec is typed data; every pixel below is owned by this file.  */
/* The model chooses WHICH sections exist and in what order — never    */
/* how any of them look — so a card cannot invent its own visual       */
/* language, and every card comes out consistent by construction.      */
/*                                                                     */
/* Records written before the sections refactor are converted on read  */
/* by sectionsOf(), so there is still exactly one render path.         */
/* ------------------------------------------------------------------ */

const ACCENTS = {
  pine: { ink: "var(--color-pine)", deep: "var(--color-pine-deep)", soft: "var(--color-pine-soft)" },
  blood: { ink: "var(--color-blood)", deep: "#8f1f1f", soft: "#fbe3e3" },
  cobalt: { ink: "var(--color-cobalt)", deep: "#155fa0", soft: "#e0eefb" },
  ember: { ink: "var(--color-ember)", deep: "#b8430a", soft: "var(--color-ember-soft)" },
  gold: { ink: "#b8770f", deep: "#8a5a00", soft: "#fdf0d8" },
} as const;

type Accent = (typeof ACCENTS)[keyof typeof ACCENTS];

function SectionHead({
  kicker,
  title,
  accent,
}: {
  kicker?: string;
  title?: string;
  accent: Accent;
}) {
  if (!kicker && !title) return null;
  return (
    <div className="mb-5">
      {kicker ? (
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px] font-bold uppercase tracking-[0.22em]"
            style={{ color: accent.ink }}
          >
            {kicker}
          </span>
          <span className="h-px flex-1" style={{ background: "var(--card-line)" }} />
        </div>
      ) : null}
      {title ? (
        <h2 className="mt-2 text-[1.55rem] font-semibold leading-tight tracking-tight sm:text-[1.8rem]">
          {title}
        </h2>
      ) : null}
    </div>
  );
}

function Caption({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="mt-3 text-[13.5px] leading-relaxed text-[color:var(--ink-faint)]">
      <Rich text={text} />
    </p>
  );
}

/* Each branch renders one section kind. A section that would draw an empty
   box never reaches here: the normalizer drops it. */
function SectionBody({ section, accent }: { section: CardSection; accent: Accent }) {
  switch (section.kind) {
    case "figure":
      return (
        <>
          <SectionHead
            kicker={section.eyebrow}
            title={section.title ?? section.visual.heading}
            accent={accent}
          />
          {section.chips?.length ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {section.chips.map((chip, i) => (
                <span
                  key={i}
                  className="rounded-md border border-[color:var(--card-line)] bg-[color:var(--card-surface)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[color:var(--ink-soft)]"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          {section.intro ? (
            <p className="mb-4 max-w-3xl text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
              <Rich text={section.intro} />
            </p>
          ) : null}
          <CardVisual
            kind={section.visual.kind}
            scene={section.visual.scene}
            params={section.visual.params}
          />
          <Caption text={section.caption} />
        </>
      );

    case "prose":
      return (
        <>
          <SectionHead kicker={section.eyebrow} title={section.title} accent={accent} />
          <div className="max-w-3xl space-y-3 text-[15.5px] leading-relaxed text-[color:var(--ink-soft)]">
            {section.paras.map((para, i) => (
              <p key={i}>
                <Rich text={para} />
              </p>
            ))}
          </div>
        </>
      );

    case "dictionary": {
      const bridgeCol = section.bridge?.col;
      const span = Math.max(1, section.columns.length);
      return (
        <>
          <SectionHead kicker={section.eyebrow} title={section.title} accent={accent} />
          {section.readAcross ? (
            <p className="mb-4 max-w-3xl text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
              <Rich text={section.readAcross} />
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-[color:var(--card-line)]">
            <table className="w-full border-collapse text-[14.5px]">
              <thead>
                <tr>
                  {section.columns.map((column, c) => (
                    <th
                      key={c}
                      className="border-b border-[color:var(--card-line)] px-3.5 py-2.5 text-left font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
                      style={{
                        background: c === bridgeCol ? accent.soft : "var(--color-paper)",
                        color: c === bridgeCol ? accent.deep : "var(--color-ink-faint)",
                      }}
                    >
                      {column}
                      {c === bridgeCol && section.bridge ? (
                        <span className="ml-1.5 font-semibold normal-case tracking-normal">
                          · {section.bridge.label}
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, r) => (
                  <Fragment key={r}>
                    <tr className="border-b border-[color:var(--card-line)] last:border-b-0">
                      {row.cells.map((cell, c) => (
                        <td
                          key={c}
                          className="px-3.5 py-3 align-top leading-relaxed"
                          style={c === bridgeCol ? { background: accent.soft } : undefined}
                        >
                          <Rich text={cell} />
                        </td>
                      ))}
                    </tr>
                    {row.note ? (
                      <tr className="border-b border-[color:var(--card-line)] bg-[color:var(--paper)]">
                        <td
                          colSpan={span}
                          className="px-3.5 py-2 text-[13px] leading-relaxed text-[color:var(--ink-soft)]"
                        >
                          <Rich text={row.note} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Caption text={section.caption} />
        </>
      );
    }


    case "derivation":
      return (
        <>
          <SectionHead kicker={section.eyebrow} title={section.title} accent={accent} />
          {section.premise ? (
            <p className="mb-4 max-w-3xl text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
              <Rich text={section.premise} />
            </p>
          ) : null}
          <ol className="space-y-3">
            {section.steps.map((step, i) => (
              <li
                key={i}
                className="rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)] p-4"
              >
                <div className="flex gap-3">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-bold"
                    style={{ background: accent.soft, color: accent.deep }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {step.body ? (
                      <p className="text-[14.5px] leading-relaxed text-[color:var(--ink-soft)]">
                        <Rich text={step.body} />
                      </p>
                    ) : null}
                    {step.latex ? (
                      <div className="mt-2 overflow-x-auto rounded-lg bg-[color:var(--paper)] px-3 py-2.5">
                        <Tex block>{step.latex}</Tex>
                      </div>
                    ) : null}
                    {step.aside ? (
                      <p
                        className="mt-2 border-l-2 pl-3 text-[13px] italic leading-relaxed text-[color:var(--ink-faint)]"
                        style={{ borderColor: accent.ink }}
                      >
                        <Rich text={step.aside} />
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {section.result ? (
            <div
              className="mt-4 flex gap-3 rounded-xl border-l-4 px-4 py-3"
              style={{ borderColor: accent.ink, background: accent.soft }}
            >
              <span
                className="mt-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: accent.deep }}
              >
                result
              </span>
              <div className="min-w-0 flex-1">
                {section.result.latex ? <Tex block>{section.result.latex}</Tex> : null}
                {section.result.body ? (
                  <p className="mt-1.5 text-[14px] leading-relaxed">
                    <Rich text={section.result.body} />
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <Caption text={section.caption} />
        </>
      );

    case "table": {
      const columns = section.columns ?? [];
      if (!columns.length) {
        return (
          <>
            <SectionHead kicker={section.eyebrow} title={section.title} accent={accent} />
            <div className="space-y-3">
              {section.rows.map((row, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)] p-4"
                >
                  {row.label ? (
                    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
                      {row.label}
                    </p>
                  ) : null}
                  <div className="mt-1.5 space-y-1.5 text-[14.5px] leading-relaxed">
                    {row.cells.map((cell, c) => (
                      <p key={c}>
                        <Rich text={cell} />
                      </p>
                    ))}
                  </div>
                  {row.note ? (
                    <p className="mt-2 border-t border-[color:var(--card-line)] pt-2 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
                      <Rich text={row.note} />
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <Caption text={section.caption} />
          </>
        );
      }
      return (
        <>
          <SectionHead kicker={section.eyebrow} title={section.title} accent={accent} />
          <div className="overflow-x-auto rounded-xl border border-[color:var(--card-line)]">
            <table className="w-full border-collapse text-[14.5px]">
              <thead>
                <tr>
                  {columns.map((column, c) => (
                    <th
                      key={c}
                      className="border-b border-[color:var(--card-line)] bg-[color:var(--paper)] px-3.5 py-2.5 text-left font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-faint)]"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, r) => (
                  <tr key={r} className="border-b border-[color:var(--card-line)] last:border-b-0">
                    {row.cells.map((cell, c) => (
                      <td key={c} className="px-3.5 py-3 align-top leading-relaxed">
                        <Rich text={cell} />
                        {c === row.cells.length - 1 && row.note ? (
                          <p className="mt-1 text-[12.5px] leading-relaxed text-[color:var(--ink-faint)]">
                            <Rich text={row.note} />
                          </p>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Caption text={section.caption} />
        </>
      );
    }


    case "callout": {
      const tone = section.tone ?? "insight";
      const warn = tone === "warn";
      const box =
        tone === "trick"
          ? "rounded-xl border-2 border-dashed p-5"
          : "rounded-xl border-l-4 px-5 py-4";
      return (
        <div
          className={box}
          style={{
            borderColor: warn ? "var(--color-blood)" : accent.ink,
            background: tone === "trick" ? "var(--color-paper)" : warn ? "#fbe3e3" : accent.soft,
          }}
        >
          <p
            className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: warn ? "#8f1f1f" : accent.deep }}
          >
            {section.eyebrow ?? tone}
          </p>
          <p
            className={
              tone === "insight"
                ? "mt-1 text-[1.1rem] font-semibold leading-snug"
                : "mt-1.5 text-[15px] leading-relaxed"
            }
          >
            <Rich text={section.text} />
          </p>
          {section.detail ? (
            <p className="mt-2 text-[13.5px] leading-relaxed text-[color:var(--ink-soft)]">
              <Rich text={section.detail} />
            </p>
          ) : null}
        </div>
      );
    }

    case "examples":
      return (
        <>
          <SectionHead
            kicker={section.eyebrow ?? "practice ramp"}
            title={section.title ?? "Practice ramp"}
            accent={accent}
          />
          {section.intro ? (
            <p className="mb-5 max-w-3xl text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
              <Rich text={section.intro} />
            </p>
          ) : null}
          <div className="space-y-4">
            {section.items.map((example, i) => (
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
        </>
      );

    case "moves":
      return (
        <>
          <SectionHead kicker={section.eyebrow ?? "the moves"} title={section.title ?? "The moves"} accent={accent} />
          {section.intro ? (
            <p className="mb-5 max-w-3xl text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
              <Rich text={section.intro} />
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {section.items.map((move, i) => (
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
                  <h3 className="text-[1.05rem] font-semibold">{move.name}</h3>
                </div>
                {move.trigger ? (
                  <p className="mt-1.5 text-[13px] font-semibold uppercase tracking-wide text-[color:var(--ink-faint)]">
                    {move.trigger}
                  </p>
                ) : null}
                {move.formula ? (
                  <div className="mt-3 overflow-x-auto rounded-lg bg-[color:var(--paper)] px-3 py-2.5">
                    <Tex block>{move.formula}</Tex>
                  </div>
                ) : null}
                {move.body ? (
                  <p className="mt-3 text-[14.5px] leading-relaxed text-[color:var(--ink-soft)]">
                    <Rich text={move.body} />
                  </p>
                ) : null}
                {move.check ? (
                  <p className="mt-3 border-t border-[color:var(--card-line)] pt-3 text-[13.5px] leading-relaxed">
                    <span className="font-bold" style={{ color: accent.ink }}>
                      Check:{" "}
                    </span>
                    <Rich text={move.check} />
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </>
      );
  }
}

/* One section, one shell. Alternating tints give the card a rhythm without
   any per-card styling: the model never picks a colour or a background. */
function SectionBlock({
  section,
  accent,
  alt,
}: {
  section: CardSection;
  accent: Accent;
  alt: boolean;
}) {
  return (
    <section
      className={`border-t border-[color:var(--card-line)] px-6 py-8 sm:px-10 ${
        alt ? "bg-[color:var(--paper)]" : ""
      }`}
    >
      <Reveal>
        <SectionBody section={section} accent={accent} />
      </Reveal>
    </section>
  );
}


export function CardRenderer({ spec }: { spec: CardSpec }) {
  const accent = ACCENTS[spec.accent] ?? ACCENTS.pine;
  const sections = sectionsOf(spec);

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

      {/* ---------------- SECTIONS ---------------- */}
      {sections.map((section, i) => (
        <SectionBlock
          key={`${section.kind}-${i}`}
          section={section}
          accent={accent}
          alt={i % 2 === 1}
        />
      ))}

      {/* ---------------- CTA ---------------- */}
      <section className="px-6 py-8 sm:px-10" style={{ background: "var(--color-deep)" }}>
        <h2 className="text-[1.4rem] font-semibold tracking-tight text-mist">{spec.cta.heading}</h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[color:var(--color-mist-soft)]">
          <Rich text={spec.cta.body} />
        </p>
        {spec.nextUp ? (
          <p className="mt-4 border-t border-[color:var(--color-deep-line)] pt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-mist-soft)]">
            next up · {spec.nextUp}
          </p>
        ) : null}
      </section>
    </article>
  );
}

