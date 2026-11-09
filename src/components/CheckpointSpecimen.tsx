/* A real checkpoint question, shown on the landing page.

   Copied verbatim from data/pathways/path_9e3494a17900af8d1b.json (Checkpoint
   01, question 1 of 8), the same pathway as the card above. The correct choice
   is deliberately NOT marked: the app grades on the server and never ships the
   answer key to the browser, so a landing illustration must not imply it does.

   The frame mirrors QuizEngine — pill, `1 / 8` counter, numbered square choice
   badges, and hearts drawn from QUIZ_LIVES so this cannot show three hearts
   after the rule changes to two.

   Prompt and choices are the generator's. The counter and closing caption are
   interface chrome the app supplies for any question, which is why they are
   worded here rather than quoted. */

import { QUESTIONS_PER_QUIZ, QUIZ_LIVES } from "@/lib/constants";

const CHOICES = [
  "The force points in the positive x direction.",
  "The force points in the negative x direction.",
  "The force is zero.",
  "The particle is at a stable equilibrium.",
];

function Heart() {
  return (
    <svg width="22" height="20" viewBox="0 0 22 20" aria-hidden>
      <path
        d="M11 18.5 C 4 13, 1 9.5, 1 6 C 1 3.2, 3.2 1, 6 1 C 8 1, 9.9 2.1, 11 3.8 C 12.1 2.1, 14 1, 16 1 C 18.8 1, 21 3.2, 21 6 C 21 9.5, 18 13, 11 18.5 Z"
        fill="var(--color-blood)"
        stroke="var(--color-blood)"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function CheckpointSpecimen() {
  return (
    <div className="rounded-[24px] border border-[#d5e0db] bg-white p-6 shadow-[0_12px_40px_rgba(16,35,31,0.06)] sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span className="rounded-full border border-[color:var(--color-cobalt)]/35 bg-[color:var(--color-cobalt)]/12 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wider text-[color:var(--color-cobalt)]">
            Concept
          </span>
          <span className="font-mono text-[12.5px] font-bold text-[color:var(--ink-faint)]">
            1 / {QUESTIONS_PER_QUIZ}
          </span>
        </span>
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: QUIZ_LIVES }).map((_, index) => (
            <Heart key={index} />
          ))}
        </span>
      </div>

      {/* Flush left, not centred: the checkpoint opens with one question filling
          the screen, not a quiz card in a modal. */}
      <p className="mt-4 text-[16.5px] leading-relaxed text-[#10231f]">
        At a point on a potential-energy curve, the tangent slopes downward as x increases. Which
        statement must be true at that point?
      </p>

      <ul className="mt-5 space-y-2.5">
        {CHOICES.map((choice, index) => (
          <li
            key={choice}
            className="flex items-start gap-3.5 rounded-2xl border-2 border-[#d5e0db] bg-white px-4 py-3.5 text-[15px] leading-relaxed text-[#10231f]"
          >
            {/* The app numbers choices 1-4 in a square badge, not A-D. */}
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#d5e0db] bg-[#f2f5f3] font-mono text-[12px] font-bold text-[color:var(--ink-faint)]">
              {index + 1}
            </span>
            <span className="min-w-0">{choice}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[13px] leading-relaxed text-[color:var(--ink-faint)]">
        You see the explanation for a question only after you commit to an answer.
      </p>
    </div>
  );
}
