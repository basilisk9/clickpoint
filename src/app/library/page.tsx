import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { requireGuest } from "@/lib/guest";
import { listPathwaysForGuest } from "@/lib/store";

export default async function LibraryPage() {
  const guest = await requireGuest().catch(() => null);
  const pathways = guest ? await listPathwaysForGuest(guest.id) : [];
  const xp = pathways.reduce((sum, item) => sum + item.xp, 0);

  return (
    <div>
      <SiteHeader xp={xp} total={pathways.length} completed={pathways.filter((p) => p.status === "ready").length} />
      <main className="shell pb-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0f766e]">library</p>
            <h1 className="mt-3 text-5xl font-semibold tracking-tight">Your pathways</h1>
          </div>
          <Link href="/" className="rounded-full bg-[#10231f] px-5 py-3 text-sm font-bold text-white no-underline">
            New from notes
          </Link>
        </div>
        <div className="mt-10 grid gap-4">
          {pathways.length === 0 ? (
            <div className="rounded-[28px] border border-[#d5e0db] bg-white p-8 text-[#5d726c]">
              No pathways yet. Upload notes on the landing page.
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
      </main>
    </div>
  );
}
