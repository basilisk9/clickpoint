/* ------------------------------------------------------------------ */
/* The hero visual: a pathway, with no subject in it.                  */
/*                                                                     */
/* WHY THIS AND NOT A CARD                                             */
/*                                                                     */
/* The strongest thing on the page to show a stranger is the product,  */
/* but a generated CARD is always about a subject — so showing one in  */
/* the hero greets every visitor with whatever subject that card       */
/* happens to be. A student of anything other than physics reads       */
/* "F(x) = -dU/dx" as "this is a physics app" and leaves, and the      */
/* product's whole premise is that it takes ANY notes.                 */
/*                                                                     */
/* The pathway map has no subject at all. "Card 01", "Checkpoint 01"   */
/* and the four states below are the actual nouns and states the app   */
/* uses, so this is the product's own screen at the size of a hero,    */
/* not an illustration of one.                                         */
/*                                                                     */
/* Deliberately a server component with no JS: it is the first thing   */
/* painted, and it must not wait on a bundle to appear above the fold. */
/* ------------------------------------------------------------------ */

/* The five states a learner actually sees, in the order they appear. The count
   below is derived from this list, so the badge cannot disagree with the rows. */
const STEPS = [
  { label: "Card 01", state: "done", note: "read" },
  { label: "Checkpoint 01", state: "done", note: "8 of 8" },
  { label: "Card 02", state: "here", note: "you are here" },
  { label: "Checkpoint 02", state: "locked", note: "unlocks after card 02" },
  { label: "Card 03", state: "writing", note: "writing…" },
] as const;

type StepState = (typeof STEPS)[number]["state"];

const DISC: Record<StepState, string> = {
  done: "border-white bg-white text-[#0f766e]",
  here: "pulse-ring border-[#0f766e] bg-white text-[#0f766e]",
  writing: "border-white bg-[#eef3f1] text-[#0f766e]",
  locked: "border-white bg-[#eef3f1] text-[#94a3b8]",
};

const GLYPH: Record<StepState, string> = {
  done: "✓",
  here: "●",
  writing: "◌",
  locked: "🔒",
};

export function PathwayPreview() {
  return (
    <div className="rounded-[26px] border border-[#d5e0db] bg-white p-5 shadow-[0_18px_50px_-28px_rgba(16,35,31,0.35)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#8299a1]">
          your pathway
        </span>
        <span className="rounded-full border border-[#0f766e]/35 bg-[#e4efe9] px-2.5 py-1 font-mono text-[11px] font-bold text-[#0a5c51]">
          {STEPS.filter((step) => step.state === "done").length} of {STEPS.length} done
        </span>
      </div>

      <ol className="mt-4">
        {STEPS.map((step, index) => {
          const last = index === STEPS.length - 1;
          return (
            <li key={step.label} className="flex items-stretch gap-3.5">
              <div className="flex flex-col items-center">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-[13px] font-bold shadow-[0_2px_8px_rgba(16,35,31,0.08)] ${DISC[step.state]}`}
                  aria-hidden
                >
                  {GLYPH[step.state]}
                </span>
                {/* The connector is what makes this a path and not a list. */}
                {last ? null : <span className="w-px flex-1 bg-[#d5e0db]" />}
              </div>

              <div className={last ? "pb-0" : "pb-4"}>
                <p
                  className={`text-[14.5px] font-semibold leading-5 ${
                    step.state === "locked" ? "text-[#94a3b8]" : "text-[#10231f]"
                  }`}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-5 text-[#8299a1]">
                  {step.state === "here" ? (
                    <span className="font-bold text-[#0f766e]">{step.note}</span>
                  ) : (
                    step.note
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-1 border-t border-[#eef3f1] pt-3 text-[12.5px] leading-5 text-[#8299a1]">
        Cards keep writing while you read the one you have.
      </p>
    </div>
  );
}
