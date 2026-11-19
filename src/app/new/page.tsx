import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { UploadForm } from "@/components/UploadForm";
import { getSessionUser } from "@/lib/auth";
import { MAX_NOTES_CHARS, MAX_UPLOAD_FILES } from "@/lib/constants";
import { getOrCreateGuest } from "@/lib/guest";
import { quotaGate } from "@/lib/progress";
import { listPathwayStarts } from "@/lib/store";

export const metadata = { title: "new pathway · clickpoint." };

/* The generator. Split out of the landing page because generating is the slow
   interaction (30-100s), and a first-time visitor should meet the product
   before they meet a progress bar.

   Account-only: a pathway costs real LLM calls and lives in the guest row an
   account owns, so building anonymously just orphans the work. Redirects to
   sign in with ?next=/new so auth returns here.

   The quota is read here rather than in the form so the locked state renders
   correctly on the first paint: the form can then tick its own countdown
   without a second request. */
export default async function NewPathwayPage() {
  const account = await getSessionUser().catch(() => null);
  if (!account) redirect("/signin?next=/new");

  const guest = await getOrCreateGuest().catch(() => null);
  const starts = guest ? await listPathwayStarts(guest.id, 1_000).catch(() => []) : [];
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
          Paste the notes, or attach up to {MAX_UPLOAD_FILES} files.
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
            <dt className="text-sm font-bold text-[#10231f]">Unlimited pathways</dt>
            <dd className="mt-1 text-[15px] leading-7 text-[#5d726c]">
              Notes up to {(MAX_NOTES_CHARS / 1000).toFixed(0)}k characters per pathway.
            </dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
