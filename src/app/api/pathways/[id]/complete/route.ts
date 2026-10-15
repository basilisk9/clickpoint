import { NextResponse } from "next/server";
import { requireGuest } from "@/lib/guest";
import { awardLessonXp } from "@/lib/pipeline";
import { getPathway, publicPathway, savePathway } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guest = await requireGuest();
    const { id } = await context.params;
    const pathway = await getPathway(id);
    if (!pathway || pathway.guestId !== guest.id) {
      return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
    }

    const body = (await request.json()) as { nodeId?: string };
    const node = pathway.nodes.find((item) => item.id === body.nodeId);
    if (!node || node.kind !== "card") {
      return NextResponse.json({ error: "Lesson node not found." }, { status: 400 });
    }
    if (node.status === "locked") {
      return NextResponse.json({ error: "That card is still locked." }, { status: 400 });
    }

    const latest = (await getPathway(id)) ?? pathway;
    const next = awardLessonXp(latest, node.id);
    await savePathway(next);
    return NextResponse.json({ pathway: publicPathway(next) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not finish lesson.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
