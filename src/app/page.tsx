import Link from "next/link";
import { CardSpecimen } from "@/components/CardSpecimen";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth";
import { PATHWAYS_PER_DAY, QUESTIONS_PER_QUIZ, QUIZ_PASS_THRESHOLD } from "@/lib/constants";

/* ------------------------------------------------------------------ */
/* The landing page.                                                   */
/*                                                                     */
/* One job: get someone to /new. So: the promise, one button, and the  */
/* product itself.                                                     */
/*                                                                     */
/* WHY THIS SHAPE                                                      */
/*                                                                     */
/* A visitor decides whether to trust the page with their notes        */
/* before they scroll, so the decision has to be possible without      */
/* scrolling. The previous version put a headline and a paragraph      */
/* above the fold and buried the actual card 1055px down a phone — so  */
/* a stranger was asked to paste a unit's worth of notes having never  */
/* seen one thing the product produces.                                */
/*                                                                     */
/* A card IS the product, so on a wide screen the card sits in the     */
/* hero, next to the promise, and is visible on the first screen. On a */
/* phone it comes immediately after the button: it cannot be side by   */
/* side there, so it must not be below a section header and a caption  */
/* as well.                                                            */
/*                                                                     */
/* What is deliberately absent: a features grid, a how-it-works        */
/* section, a stats band. There is one feature. The specimen is the    */
/* proof of it, and description would only be repetition.              */
/*                                                                     */
/* Asked for nothing here: no guest is created for a visitor who is    */
/* only looking. The session read is for the header's account chip,    */
/* and the quota belongs on /new next to the form it gates.            */
/* ------------------------------------------------------------------ */

const PASS_PERCENT = Math.round(QUIZ_PASS_THRESHOLD * 100);

export default async function Home() {
  const account = await getSessionUser().catch(() => null);

  return (
    <div>
      <SiteHeader account={account ? { username: account.username } : null} />

      <main className="shell pb-20 pt-6 sm:pt-12">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-12 xl:gap-16">
          {/* ---------------- THE PROMISE ---------------- */}
          <div className="lg:pt-8">
            {/* Sized for the COLUMN, not the viewport: in the two-column
                layout this is ~500px wide, and the headline has to stay two
                lines. At the old 60px it wrapped to four and read as a wall. */}
            <h1 className="text-[2.5rem] font-semibold leading-[1.02] tracking-tight sm:text-5xl xl:text-[3.5rem]">
              Paste your notes.
              <br />
              <span className="text-[#0f766e]">Get the pathway.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#5d726c]">
              One card per idea, each written from your own material. Pass the{" "}
              {QUESTIONS_PER_QUIZ}-question checkpoint and the next card opens.
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

          {/* ---------------- THE PROOF ---------------- */}
          <div className="mt-10 lg:mt-0">
            <CardSpecimen />
          </div>
        </div>

        {/* One short band, below the fold, for the visitor who is now
            convinced but still scrolling. */}
        <section className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#d5e0db] pt-8">
          <Link href="/new" className="btn btn-primary">
            Start from my notes
          </Link>
          <p className="text-sm leading-6 text-[#5d726c]">
            Score {PASS_PERCENT}% on a checkpoint to unlock the next card.
          </p>
        </section>
      </main>
    </div>
  );
}
