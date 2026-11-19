import Link from "next/link";
import { PathwayPreview } from "@/components/PathwayPreview";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth";

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
/* The pathway map has no subject. It is the product's own screen, in   */
/* its own nouns — Card 01, Checkpoint 01, locked, writing — so it     */
/* says "you get a path" to everyone and claims nothing false.          */
/* ------------------------------------------------------------------ */



export default async function Home() {
  const account = await getSessionUser().catch(() => null);

  return (
    <div>
      <SiteHeader account={account ? { username: account.username } : null} />

      <main className="shell pb-20 pt-6 sm:pt-10">
        {/* The hero owns the first screen. Content is centred in it, so the
            section below starts at >= 100vh and the example card is off-screen
            until the visitor scrolls.

            WHY NOT JUST RENDER IT LOW: "below the fold" was true only on
            paper. Measured at 1440x950, 1366x768 and 1920x1080 the specimen's
            header sat inside the first viewport — the pill, the heading and
            the lead were all readable without scrolling, so every visitor was
            greeted by physics after all. Grid height is now pinned to the
            viewport minus the chrome above it (84px header + 40px main
            padding = 124px, measured), which makes the fold a property of the
            layout instead of a function of window height. */}
        <div className="lg:grid lg:min-h-[calc(100vh-124px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:items-center lg:gap-14">
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

            {/* The one line that defuses "what does trying this cost me" —
                both currencies. Money is the easy half; the 30-100s
                generation wait is the real cost, and meeting it only after
                the click reads as a bait-and-switch. "no credit card", not
                "no card": this product's unit is a card. */}
            <p className="mt-4 text-sm text-[#5d726c]">
              Free — unlimited pathways, no credit card. The first card takes about a
              minute.
            </p>
          </div>

          {/* ---------------- THE PRODUCT ---------------- */}
          <div className="mt-10 lg:mt-0">
            <PathwayPreview />
          </div>
        </div>

      </main>
    </div>
  );
}
