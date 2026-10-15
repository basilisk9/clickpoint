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
  const node = pathway.nodes.find((item) => item.id === nodeId);
  if (!node || node.kind !== "card" || node.status === "locked" || !(node.card || node.html))
    notFound();
  return <CardFrame pathway={publicPathway(pathway)} node={node} />;
}
