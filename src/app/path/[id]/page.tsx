import { notFound } from "next/navigation";
import { PathwayView } from "@/components/PathwayView";
import { getSessionUser } from "@/lib/auth";
import { requireGuest } from "@/lib/guest";
import { getPathway, publicPathway } from "@/lib/store";

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
  return (
    <PathwayView
      initial={publicPathway(pathway)}
      lastPathwayAt={guest.lastPathwayAt ?? null}
      account={account ? { username: account.username } : null}
    />
  );
}
