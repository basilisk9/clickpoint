import { NextResponse } from "next/server";
import { MAX_NOTES_CHARS, PATHWAYS_PER_DAY } from "@/lib/constants";
import { extractNotesFromUploads } from "@/lib/extract";
import { getOrCreateGuest } from "@/lib/guest";
import { createPathwayFromNotes } from "@/lib/pipeline";
import { checkPathwayQuota } from "@/lib/ratelimit";
import { listPathwayStarts, listPathwaysForGuest, publicPathway } from "@/lib/store";

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

    /* Checked before any LLM work so a blocked request costs nothing. The
       count comes from the pathway_starts rows; the route no longer writes a
       timestamp, because createPathwayFromNotes records the start itself. */
    const limit = checkPathwayQuota(
      await listPathwayStarts(guest.id, PATHWAYS_PER_DAY),
    );
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
      const files: File[] = [];
      for (const entry of form.getAll("file")) {
        if (entry instanceof File && entry.size > 0) files.push(entry);
      }

      /* Pasted text comes first: it is this unit's own words, and a learner who
         pasted the important part should not have it buried under a lecture
         PDF. */
      const chunks: string[] = [];
      if (pasted) chunks.push(pasted);
      if (files.length) chunks.push(await extractNotesFromUploads(files));
      notes = chunks.join("\n\n").trim();
    } else {
      const body = (await request.json()) as { notes?: string };
      notes = String(body.notes || "").trim();
    }

    /* Refused, not truncated. The notes are re-sent to the model for every
       card AND every checkpoint — up to 20-40 calls — so an oversized dump is
       both slow and expensive, and silently cutting it would produce a pathway
       from notes the learner cannot see were dropped. */
    if (notes.length > MAX_NOTES_CHARS) {
      return NextResponse.json(
        {
          error: `Those notes are ${Math.round(notes.length / 1000)}k characters, over the ${
            MAX_NOTES_CHARS / 1000
          }k limit. Trim them, or split the unit across two pathways.`,
        },
        { status: 400 },
      );
    }

    const pathway = await createPathwayFromNotes(guest, notes);
    return NextResponse.json({ pathway: publicPathway(pathway) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build pathway.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
