import { notFound } from "next/navigation";
import { QuizEngine } from "@/components/QuizEngine";
import { requireGuest } from "@/lib/guest";
import { getPathway, publicPathway } from "@/lib/store";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ id: string; nodeId: string }>;
}) {
  const guest = await requireGuest().catch(() => null);
  if (!guest) notFound();
  const { id, nodeId } = await params;
  const pathway = await getPathway(id);
  if (!pathway || pathway.guestId !== guest.id) notFound();
  const node = pathway.nodes.find((item) => item.id === nodeId);
  if (!node || node.kind !== "quiz" || node.status === "locked" || !node.quiz) notFound();
  return <QuizEngine pathway={publicPathway(pathway)} node={node} />;
}
