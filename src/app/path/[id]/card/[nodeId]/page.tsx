import { notFound } from "next/navigation";
import { CardFrame } from "@/components/CardFrame";
import { requireGuest } from "@/lib/guest";
import { getPathway, publicPathway } from "@/lib/store";

export default async function CardPage({
  params,
}: {
  params: Promise<{ id: string; nodeId: string }>;
}) {
  const { id, nodeId } = await params;
  const guest = await requireGuest().catch(() => null);
  if (!guest) notFound();
  const pathway = await getPathway(id);
  if (!pathway || pathway.guestId !== guest.id) notFound();
  /* Read the node from the PUBLIC copy, not the raw record: publicPathway is
     where a saved simulation's readouts are corrected against its own JS, and
     passing the raw node here would render the card this page just repaired
     the pathway around. */
  const view = publicPathway(pathway);
  const node = view.nodes.find((item) => item.id === nodeId);
  if (!node || node.kind !== "card" || node.status === "locked" || !node.card)
    notFound();
  return <CardFrame pathway={view} node={node} />;
}
