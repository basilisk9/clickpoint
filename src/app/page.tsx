import Link from "next/link";
import { CardSpecimen } from "@/components/CardSpecimen";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth";
import {
  PATHWAYS_PER_DAY,
  QUESTIONS_PER_QUIZ,
  QUIZ_PASS_THRESHOLD,
} from "@/lib/constants";

/* ------------------------------------------------------------------ */
/* The landing page.                                                   */
/*                                                                     */
/* It has one job: get someone to /new. So it holds a hook, one piece  */
/* of real proof, and one button. Everything that described HOW the    */
/* product works — the feature blurbs, the spec grid, the second       */
/* specimen — is gone; a stranger decides in seconds and reads none    */
/* of it. The generator form lives on /new, because generating is the  */
/* slow interaction and this page must never block on it.              */
/*                                                                     */
/* It no longer creates a guest for a visitor who is only looking: the */
/* session read is for the header's account chip, nothing else. The    */
/* quota is not consulted here at all — a stranger has no quota to      */
/* consult, and the locked state belongs on /new next to the form.     */
/* ------------------------------------------------------------------ */

const PASS_PERCENT = Math.round(QUIZ_PASS_THRESHOLD * 100);

export default async function Home() {
  const account = await getSessionUser().catch(() => null);

  return (
    <div>
      <SiteHeader account={account ? { username: account.username } : null} />
      <main className="shell pb-24 pt-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0f766e]">
          {PATHWAYS_PER_DAY} pathways a day · free
        </p>
        <h1 className="mt-4 max-w-4xl text-6xl font-semibold leading-[0.95] tracking-tight sm:text-7xl">
          Dump the unit.
          <br />
          Walk the path.
        </h1>
        <p className="mt-6 max-w-2xl text-xl leading-8 text-[#5d726c]">
          Paste your notes. Get a pathway of cards, each taught from your own material.
          Pass the {QUESTIONS_PER_QUIZ}-question checkpoint at the end of a card and the next
          one opens.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/new" className="btn btn-primary btn-lg">
            Start from your notes
          </Link>
          <Link href="/library" className="text-sm font-semibold text-[#5d726c] no-underline">
            or open your library →
          </Link>
        </div>

        {/* One specimen, not two. A card is the product; the checkpoint is a
            variant of it, and the second block was the page explaining itself
            instead of showing itself. */}
        <section className="mt-20">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0f766e]">
            real output, trimmed
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight">
            This is a card, from someone else&apos;s notes.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#5d726c]">
            Every example cites the source it came from, and a correct checkpoint answer is
            worth more than a fast one — you need {PASS_PERCENT}% to move on.
          </p>
          <div className="mt-8">
            <CardSpecimen />
          </div>
        </section>

        <section className="mt-16 flex flex-wrap items-center gap-4 border-t border-[#d5e0db] pt-10">
          <Link href="/new" className="btn btn-primary">
            Start from your notes
          </Link>
          <p className="text-sm text-[#5d726c]">
            Free, no card. {PATHWAYS_PER_DAY} pathways a day.
          </p>
        </section>
      </main>
    </div>
  );
}
