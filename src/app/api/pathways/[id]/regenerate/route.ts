import { NextResponse } from "next/server";
import { requireGuest } from "@/lib/guest";
import { regenerateNode } from "@/lib/pipeline";
import { getPathway, publicPathway } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    if (!body.nodeId) {
      return NextResponse.json({ error: "nodeId required." }, { status: 400 });
    }
    const next = await regenerateNode(pathway, body.nodeId);
    return NextResponse.json({ pathway: publicPathway(next) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not regenerate.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
