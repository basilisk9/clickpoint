import { SiteHeader } from "@/components/SiteHeader";
import { UploadForm } from "@/components/UploadForm";
import { getSessionUser } from "@/lib/auth";
import { MAX_NOTES_CHARS, MAX_UPLOAD_FILES, PATHWAYS_PER_DAY } from "@/lib/constants";
import { getOrCreateGuest } from "@/lib/guest";
import { quotaGate } from "@/lib/progress";
import { listPathwayStarts } from "@/lib/store";

export const metadata = { title: "new pathway · clickpoint." };

/* The generator. Split out of the landing page because generating is the slow
   interaction (30-100s), and a first-time visitor should meet the product
   before they meet a progress bar.

   The quota is read here rather than in the form so the locked state renders
   correctly on the first paint: the form can then tick its own countdown
   without a second request. */
export default async function NewPathwayPage() {
  const guest = await getOrCreateGuest().catch(() => null);
  const account = await getSessionUser().catch(() => null);
  const starts = guest
    ? await listPathwayStarts(guest.id, PATHWAYS_PER_DAY).catch(() => [])
    : [];
  const gate = quotaGate(starts);

  return (
    <div>
      <SiteHeader account={account ? { username: account.username } : null} />
      <main className="shell pb-24 pt-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0f766e]">
          new pathway
        </p>
        <h1 className="mt-3 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-tight">
          Dump the unit.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[#5d726c]">
          Paste the notes, or attach up to {MAX_UPLOAD_FILES} files. You wait for the first
          card, then read while the rest write themselves.
        </p>

        <div className="mt-8 max-w-3xl">
          <UploadForm
            lockedUntil={gate.locked ? gate.retryAt : null}
            used={gate.used}
          />
        </div>

        <dl className="mt-10 grid max-w-3xl gap-6 border-t border-[#d5e0db] pt-8 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-bold text-[#10231f]">Notes, not a syllabus</dt>
            <dd className="mt-1 text-[15px] leading-7 text-[#5d726c]">
              Messy is fine. Bullets, formulas, pasted questions.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[#10231f]">One card per idea</dt>
            <dd className="mt-1 text-[15px] leading-7 text-[#5d726c]">
              Each ends in a checkpoint you have to pass.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[#10231f]">
              {PATHWAYS_PER_DAY} pathways a day
            </dt>
            <dd className="mt-1 text-[15px] leading-7 text-[#5d726c]">
              Notes up to {(MAX_NOTES_CHARS / 1000).toFixed(0)}k characters per pathway.
            </dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
