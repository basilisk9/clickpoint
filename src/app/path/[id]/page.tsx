import { notFound } from "next/navigation";
import { PathwayView } from "@/components/PathwayView";
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
  return <PathwayView initial={publicPathway(pathway)} />;
}
