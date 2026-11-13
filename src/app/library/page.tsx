import Link from "next/link";
import { FeedbackButton } from "@/components/FeedbackButton";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth";
import { requireGuest } from "@/lib/guest";
import { listPathwaysForGuest } from "@/lib/store";

export default async function LibraryPage() {
  const guest = await requireGuest().catch(() => null);
  const pathways = guest ? await listPathwaysForGuest(guest.id) : [];
  const account = await getSessionUser().catch(() => null);
  const xp = pathways.reduce((sum, item) => sum + item.xp, 0);

  return (
    <div>
      <SiteHeader
        xp={xp}
        total={pathways.length}
        completed={pathways.filter((p) => p.status === "ready").length}
        account={account ? { username: account.username } : null}
      />
      <main className="shell pb-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0f766e]">library</p>
            <h1 className="mt-3 text-5xl font-semibold tracking-tight">Your pathways</h1>
          </div>
          <Link href="/" className="btn btn-primary btn-sm">
            New from notes
          </Link>
        </div>

        {account ? null : (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#d5e0db] bg-white/90 px-6 py-4">
            <p className="text-sm leading-6 text-[#5d726c]">
              These pathways are only on this browser.
            </p>
            <div className="flex gap-3">
              <Link href="/signin" className="btn btn-quiet btn-sm">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-4">
          {pathways.length === 0 ? (
            <div className="rounded-[28px] border border-[#d5e0db] bg-white p-8">
              <p className="text-lg font-semibold">No pathways yet.</p>
              <Link href="/new" className="btn btn-primary mt-5">
                Make your first pathway
              </Link>
            </div>
          ) : (
            pathways.map((pathway) => (
              <Link
                key={pathway.id}
                href={`/path/${pathway.id}`}
                className="rounded-[28px] border border-[#d5e0db] bg-white p-6 no-underline shadow-[0_12px_40px_rgba(16,35,31,0.06)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold">{pathway.title}</h2>
                    <p className="mt-2 max-w-3xl text-[#5d726c]">{pathway.blurb}</p>
                  </div>
                  <span className="chip">{pathway.status}</span>
                </div>
                <div className="mt-5 flex flex-wrap gap-3 text-sm text-[#5d726c]">
                  <span className="chip">{pathway.completedNodes}/{pathway.totalNodes} nodes</span>
                  <span className="chip">★ {pathway.xp} XP</span>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* The general box lives here, next to everything the learner has made,
            rather than floating over every screen. Reports about a specific
            card or question are asked for on those screens, where the node id
            is available. */}
        <div className="mt-10 max-w-xl">
          <FeedbackButton
            label="Something else? Send feedback"
            targets={["bug", "idea", "general"]}
          />
        </div>
      </main>
    </div>
  );
}
