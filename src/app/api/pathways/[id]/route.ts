import { NextResponse } from "next/server";
import { requireGuest } from "@/lib/guest";
import { getPathway, publicPathway } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guest = await requireGuest();
    const { id } = await context.params;
    const pathway = await getPathway(id);
    if (!pathway || pathway.guestId !== guest.id) {
      return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
    }
    return NextResponse.json({ pathway: publicPathway(pathway) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
