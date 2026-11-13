import { notFound } from "next/navigation";
import { PathwayView } from "@/components/PathwayView";
import { getSessionUser } from "@/lib/auth";
import { PATHWAYS_PER_DAY } from "@/lib/constants";
import { requireGuest } from "@/lib/guest";
import { getPathway, listPathwayStarts, publicPathway } from "@/lib/store";

export default async function PathwayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const guest = await requireGuest().catch(() => null);
  if (!guest) notFound();
  const { id } = await params;
  const pathway = await getPathway(id);
  if (!pathway || pathway.guestId !== guest.id) notFound();
  const account = await getSessionUser().catch(() => null);
  /* The raw start timestamps, not a precomputed gate: the countdown has to keep
     ticking while the page sits open, which only the client clock can do. */
  const starts = await listPathwayStarts(guest.id, PATHWAYS_PER_DAY).catch(() => []);
  return (
    <PathwayView
      initial={publicPathway(pathway)}
      starts={starts}
      account={account ? { username: account.username } : null}
    />
  );
}
