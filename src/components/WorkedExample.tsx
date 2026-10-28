"use client";

import { useState, type ReactNode } from "react";
import type { CardLevel } from "@/lib/types";

const TONES: Record<CardLevel, { chip: string; bar: string }> = {
  breeze: {
    chip: "bg-[color:var(--paper2)] text-[color:var(--ink-soft)] border-[color:var(--ink)]/20",
    bar: "bg-[color:var(--ink-faint)]",
  },
  warm: {
    chip: "bg-pine-soft text-pine-deep border-pine/30",
    bar: "bg-pine",
  },
  firm: {
    chip: "bg-cobalt/10 text-cobalt border-cobalt/30",
    bar: "bg-cobalt",
  },
  brutal: {
    chip: "bg-ember-soft text-ember border-ember/30",
    bar: "bg-ember",
  },
  transfer: {
    chip: "bg-gold/15 text-[#8a5a00] border-gold/40",
    bar: "bg-gold",
  },
};

/* Reveals a worked example one step at a time. The learner is asked to try it
   before the next line appears — the HTML cards only ever had a flat toggle. */
export function WorkedExample({
  index,
  level,
  source,
  title,
  prompt,
  steps,
  takeaway,
}: {
  index: number;
  level: CardLevel;
  source: string;
  title: string;
  prompt: ReactNode;
  steps: ReactNode[];
  takeaway: ReactNode;
}) {
  const [shown, setShown] = useState(0);
  const done = shown >= steps.length;
  const tone = TONES[level] ?? TONES.warm;
  return (
    <article className="overflow-hidden rounded-xl border-2 border-[color:var(--ink)]/12 bg-[color:var(--card-surface)] shadow-[0_8px_28px_-20px_rgba(19,42,50,0.4)]">
      <div className={`h-1.5 ${tone.bar}`} />
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] font-bold text-[color:var(--ink-faint)]">
            {String(index).padStart(2, "0")}
          </span>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${tone.chip}`}
          >
            {level}
          </span>
          <span className="rounded-full border border-[color:var(--card-line)] bg-[color:var(--paper2)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[color:var(--ink-soft)]">
            {source}
          </span>
          {done && (
            <span className="pop-in ml-auto flex items-center gap-1 text-[12px] font-bold text-pine">
              <svg width="13" height="13" viewBox="0 0 13 13">
                <path
                  d="M1.5 7 L5 10.5 L11.5 2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              cleared
            </span>
          )}
        </div>

        <h3 className="mt-2.5 font-semibold text-[1.35rem] leading-tight sm:text-2xl">
          {title}
        </h3>
        <div className="mt-2 text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
          {prompt}
        </div>

        <ol className="mt-4 space-y-2.5">
          {steps.slice(0, shown).map((step, i) => (
            <li
              key={i}
              className="pop-in flex gap-3 rounded-lg border border-[color:var(--card-line)] bg-[color:var(--paper)] px-3.5 py-3 text-[14.5px] leading-relaxed"
            >
              <span className="mt-0.5 font-mono text-[12px] font-bold text-[color:var(--ink-faint)]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">{step}</div>
            </li>
          ))}
        </ol>

        {!done ? (
          <button
            type="button"
            onClick={() => setShown((s) => s + 1)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[color:var(--ink)]/20 bg-[color:var(--paper2)] py-2.5 text-sm font-bold text-[color:var(--ink)] transition hover:border-[color:var(--ink)]/40 hover:bg-[color:var(--card-surface)] active:translate-y-px"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                d="M6 1 v10 M1 6 h10"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
            {shown === 0
              ? "Try it first, then reveal line 1"
              : `Reveal line ${shown + 1} of ${steps.length}`}
          </button>
        ) : (
          <div className="mt-4 rounded-lg border-l-4 border-pine bg-pine-soft/60 px-4 py-3 text-[14px] leading-relaxed">
            <span className="font-bold text-pine-deep">
              What just happened —{" "}
            </span>
            {takeaway}
          </div>
        )}
      </div>
    </article>
  );
}
