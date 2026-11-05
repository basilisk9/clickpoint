import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { UploadForm } from "@/components/UploadForm";
import { getOrCreateGuest } from "@/lib/guest";
import { PATHWAY_COOLDOWN_MS } from "@/lib/constants";
import { dailyGate } from "@/lib/progress";

export default async function Home() {
  /* The landing page already promises "one pathway per day". Until now that
     rule only lived in the API, so a returning visitor filled the form,
     waited, and got a 429. Read the same rule here so the form can say it up
     front. `getOrCreateGuest` is safe on a GET: it only writes a cookie. */
  const guest = await getOrCreateGuest().catch(() => null);
  const gate = dailyGate(guest?.lastPathwayAt, PATHWAY_COOLDOWN_MS);

  return (
    <div>
      <SiteHeader />
      <main className="shell pb-20 pt-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0f766e]">
          notes in · click out
        </p>
        <h1 className="mt-4 max-w-3xl text-6xl font-semibold leading-[0.95] tracking-tight">
          Dump the unit.
          <br />
          Walk the path.
        </h1>
        <p className="mt-6 max-w-2xl text-xl leading-8 text-[#5d726c]">
          Clickpoint turns raw notes into a linear pathway: one lesson card,
          then a checkpoint, then the next card. You wait only for the first
          lesson. The rest writes itself while you work.
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <UploadForm lockedUntil={gate.locked ? gate.retryAt : null} waitLabel={gate.wait} />
          <aside className="rounded-[28px] border border-[#d5e0db] bg-[#10242c] p-6 text-[#e8eef2]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f59e0b]">
              How it works
            </p>
            <ol className="mt-5 space-y-4 text-[17px] leading-7">
              <li>1. Upload a PDF, PPTX, or paste the notes.</li>
              <li>2. Grok writes the syllabus, banner, and card 1.</li>
              <li>3. You learn. Later cards generate in the background.</li>
              <li>4. Every card is followed by an 8-question checkpoint.</li>
            </ol>
            <p className="mt-5 text-sm leading-6 text-[#93a7b4]">
              One pathway per day. Build it, walk it, come back tomorrow.
            </p>
            <Link href="/library" className="mt-8 inline-flex text-sm font-bold text-[#7dcea0]">
              Open your library →
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}
