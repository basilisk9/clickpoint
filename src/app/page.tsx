import Link from "next/link";
import { CardSpecimen } from "@/components/CardSpecimen";
import { PathwayPreview } from "@/components/PathwayPreview";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth";
import { PATHWAYS_PER_DAY, QUESTIONS_PER_QUIZ, QUIZ_PASS_THRESHOLD } from "@/lib/constants";

/* ------------------------------------------------------------------ */
/* The landing page.                                                   */
/*                                                                     */
/* One job: get someone to /new. So: the promise, one button, and the  */
/* product itself.                                                     */
/*                                                                     */
/* WHAT THE HERO SHOWS, AND WHY IT IS NOT A CARD                       */
/*                                                                     */
/* A visitor's first question is "is this for me?", not "what does the */
/* output look like?" — and the only thing that answers the first      */
/* question is subject-neutral.                                        */
/*                                                                     */
/* The hero used to show a generated card. That is real output, but a   */
/* card is ALWAYS about a subject, so the page greeted every visitor    */
/* with physics: a biology or history student read "F(x) = -dU/dx" as  */
/* "this is a physics app" and left, when the whole premise is that the */
/* app takes any notes at all.                                         */
/*                                                                     */
/* The pathway map has no subject. It is the product's own screen, in   */
/* its own nouns — Card 01, Checkpoint 01, locked, writing — so it      */
/* says "you get a path" to everyone and claims nothing false.          */
/*                                                                     */
/* The real card comes below the fold, labelled as ONE EXAMPLE, where   */
/* a visitor who is interested can confirm the output is dense and      */
/* written from their material. Anyone it does not speak to has already */
/* seen enough to click.                                                */
/*                                                                     */
/* THE FOLD (verified, not estimated)                                  */
/* Promise, button, and the pathway preview are all visible without     */
/* scrolling at 1440x950, 1366x768 and 390x844.                         */
/* ------------------------------------------------------------------ */

const PASS_PERCENT = Math.round(QUIZ_PASS_THRESHOLD * 100);

export default async function Home() {
  const account = await getSessionUser().catch(() => null);

  return (
    <div>
      <SiteHeader account={account ? { username: account.username } : null} />

      <main className="shell pb-20 pt-6 sm:pt-10">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:items-center lg:gap-14">
          {/* ---------------- THE PROMISE ---------------- */}
          <div>
            {/* Sized for the COLUMN, not the viewport: in the two-column
                layout this is ~520px wide and the headline has to stay two
                lines. At 60px it wrapped to four and read as a wall. */}
            <h1 className="text-[2.5rem] font-semibold leading-[1.02] tracking-tight sm:text-5xl xl:text-[3.5rem]">
              Paste your notes.
              <br />
              <span className="text-[#0f766e]">Get the pathway.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#5d726c]">
              Any subject. Your notes become a path of cards, one idea each, written from
              the material you gave it — with a checkpoint after every card.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href="/new" className="btn btn-primary btn-lg">
                Start from my notes
              </Link>
              <Link
                href="/library"
                className="text-sm font-semibold text-[#5d726c] no-underline hover:text-[#10231f]"
              >
                or open your library →
              </Link>
            </div>

            {/* The one line that defuses "what does trying this cost me". */}
            <p className="mt-4 text-sm text-[#5d726c]">
              Free. {PATHWAYS_PER_DAY} pathways a day, no card.
            </p>
          </div>

          {/* ---------------- THE PRODUCT ---------------- */}
          <div className="mt-10 lg:mt-0">
            <PathwayPreview />
          </div>
        </div>

        {/* ---------------- ONE EXAMPLE, BELOW THE FOLD ----------------
            The proof, for the visitor who is interested but not yet
            convinced. Labelled as an example so nobody reads it as a
            promise that everything is physics. */}
        <section className="mt-20 border-t border-[#d5e0db] pt-10 sm:mt-28">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-14">
            <div className="lg:pt-2">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0f766e]">
                what a card looks like
              </p>
              {/* No subject in the headline. The specimen below is physics, but
                  the page should not announce a subject a reader has to rule
                  out before deciding the product is for them. */}
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
                One card, from real notes.
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-[#5d726c]">
                The one below came from a physics unit. Yours will be about whatever you
                paste — the shape is what stays the same. A card states the idea, shows the
                moves that use it, and works examples from your own material, each citing
                where it came from.
              </p>
              <p className="mt-4 text-[15px] leading-7 text-[#5d726c]">
                A checkpoint is {QUESTIONS_PER_QUIZ} questions on the card you just read.
                Score {PASS_PERCENT}% and the next card unlocks.
              </p>
              <Link href="/new" className="btn btn-primary mt-6">
                Start from my notes
              </Link>
            </div>
            <CardSpecimen />
          </div>
        </section>
      </main>
    </div>
  );
}
