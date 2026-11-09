import { CardSpecimen } from "@/components/CardSpecimen";
import { CheckpointSpecimen } from "@/components/CheckpointSpecimen";
import { SiteHeader } from "@/components/SiteHeader";
import { UploadForm } from "@/components/UploadForm";
import { getSessionUser } from "@/lib/auth";
import {
  CORRECT_ANSWER_XP,
  FINISH_LESSON_XP,
  MAX_LESSONS,
  MIN_LESSONS,
  PATHWAY_COOLDOWN_MS,
  QUESTIONS_PER_QUIZ,
  QUIZ_PASS_THRESHOLD,
} from "@/lib/constants";
import { getOrCreateGuest } from "@/lib/guest";
import { dailyGate } from "@/lib/progress";

/* Product facts come from constants.ts rather than being typed by hand, so
   changing a rule cannot leave this page describing the old one. */
const HOURS_PER_PATHWAY = Math.round(PATHWAY_COOLDOWN_MS / (60 * 60 * 1000));
const PASS_PERCENT = Math.round(QUIZ_PASS_THRESHOLD * 100);

const FACTS = [
  { value: `${MIN_LESSONS}\u2013${MAX_LESSONS}`, label: "lessons per pathway" },
  { value: `${QUESTIONS_PER_QUIZ}`, label: "questions per checkpoint" },
  { value: `${PASS_PERCENT}%`, label: "needed to unlock the next card" },
  { value: `${HOURS_PER_PATHWAY}h`, label: "between new pathways" },
];

export default async function Home() {
  /* The daily rule lives in the API, so a returning visitor used to fill the
     form, wait, and get a 429. Read the same rule here so the form can show
     its locked state up front. `getOrCreateGuest` is safe on a GET: it only
     writes a cookie. */
  const guest = await getOrCreateGuest().catch(() => null);
  const gate = dailyGate(guest?.lastPathwayAt, PATHWAY_COOLDOWN_MS);
  const account = await getSessionUser().catch(() => null);

  return (
    <div>
      <SiteHeader account={account ? { username: account.username } : null} />
      <main className="shell pb-24 pt-8">
        <h1 className="max-w-3xl text-6xl font-semibold leading-[0.95] tracking-tight">
          Dump the unit.
          <br />
          Walk the path.
        </h1>
        <p className="mt-6 max-w-2xl text-xl leading-8 text-[#5d726c]">
          Paste your notes. Every card ends in a checkpoint you have to pass.
        </p>

        <div className="mt-8 max-w-3xl">
          <UploadForm lockedUntil={gate.locked ? gate.retryAt : null} waitLabel={gate.wait} />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* What actually comes back. Both specimens below are real output    */}
        {/* copied from generated pathways, so this section can be checked    */}
        {/* against the product instead of taken on trust.                    */}
        {/* ---------------------------------------------------------------- */}

        <section className="mt-20 grid items-start gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0f766e]">
              One card per idea
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
              Written from the notes you gave it.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#5d726c]">
              Your notes are split into lessons, and each lesson becomes one card. The card states
              the rule, shows the move that uses it, and works an example from your own material.
            </p>
            <dl className="mt-8 space-y-5 border-t border-[#d5e0db] pt-6">
              <div>
                <dt className="text-sm font-bold text-[#10231f]">One idea, not a summary.</dt>
                <dd className="mt-1 text-[15px] leading-7 text-[#5d726c]">
                  A card states the rule in one sentence, then works examples at rising difficulty.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-bold text-[#10231f]">Every example cites its source.</dt>
                <dd className="mt-1 text-[15px] leading-7 text-[#5d726c]">
                  Examples carry the source they came from, so a step you cannot find in your own
                  material is a step you can challenge.
                </dd>
              </div>
            </dl>
            <p className="mt-6 text-sm leading-6 text-[#5d726c]">
              Both specimens below are real output, trimmed to their text so the page stays short.
            </p>
          </div>

          <CardSpecimen />
        </section>

        <section className="mt-20 grid items-start gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div className="lg:order-2">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0f766e]">
              Then prove it
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
              The next card unlocks only when you pass the checkpoint.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#5d726c]">
              Each checkpoint asks {QUESTIONS_PER_QUIZ} questions about the card you just read, then
              shows the explanation for each one. Score {PASS_PERCENT}% and the next card opens.
            </p>
            <p className="mt-6 text-sm leading-6 text-[#5d726c]">
              A correct answer is worth {CORRECT_ANSWER_XP} XP; finishing a card is worth{" "}
              {FINISH_LESSON_XP} XP. The question shown is a real one, from the same pathway as the
              card, and it is not marked up: the app never sends the answer key to your browser.
            </p>
          </div>

          <div className="lg:order-1">
            <CheckpointSpecimen />
          </div>
        </section>

        {/* Numbers you can check against the app, not adjectives. */}
        <section className="mt-20 border-t border-[#d5e0db] pt-10">
          <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FACTS.map((fact) => (
              <div key={fact.label}>
                <dt className="text-4xl font-semibold tracking-tight text-[#10231f]">
                  {fact.value}
                </dt>
                <dd className="mt-2 text-sm leading-6 text-[#5d726c]">{fact.label}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 max-w-2xl text-sm leading-6 text-[#5d726c]">
            One new pathway a day, so nothing here is generated from notes you never opened.
          </p>
        </section>

      </main>
    </div>
  );
}
