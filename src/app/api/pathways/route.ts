import { NextResponse } from "next/server";
import { extractNotesFromUpload } from "@/lib/extract";
import { getOrCreateGuest } from "@/lib/guest";
import { createPathwayFromNotes } from "@/lib/pipeline";
import { checkPathwayLimit } from "@/lib/ratelimit";
import { listPathwaysForGuest, publicPathway, saveGuest } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const guest = await getOrCreateGuest();
  const pathways = await listPathwaysForGuest(guest.id);
  return NextResponse.json({ guestId: guest.id, pathways });
}

export async function POST(request: Request) {
  try {
    const guest = await getOrCreateGuest();

    /* Checked before any LLM work so a blocked request costs nothing. */
    const limit = checkPathwayLimit(guest);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: limit.message, retryAt: limit.retryAt },
        { status: 429 },
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let notes = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const pasted = String(form.get("notes") || "").trim();
      const file = form.get("file");
      const chunks: string[] = [];
      if (pasted) chunks.push(pasted);
      if (file instanceof File && file.size > 0) {
        chunks.push(await extractNotesFromUpload(file));
      }
      notes = chunks.join("\n\n").trim();
    } else {
      const body = (await request.json()) as { notes?: string };
      notes = String(body.notes || "").trim();
    }

    /* Stamped before generating, so a run that fails partway still counts.
       Otherwise repeated failures would each burn the full LLM budget. */
    guest.lastPathwayAt = new Date().toISOString();
    await saveGuest(guest);

    const pathway = await createPathwayFromNotes(guest, notes);
    return NextResponse.json({ pathway: publicPathway(pathway) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build pathway.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
