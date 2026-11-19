import { chatJson, reviewModel } from "./ai";
import { buildCardDocument } from "./cardDocument";
import { CARD_REVIEW_SYSTEM, cardReviewUser } from "./prompts";
import type { HtmlCard } from "./types";

/* ------------------------------------------------------------------ */
/* Semantic review — ONE call, surgical patches, all-or-nothing.      */
/*                                                                     */
/* The reviewer receives the exact document the learner gets, so it     */
/* judges the same artifact the browser renders, not a summary of it.  */
/* It may only fix what is factually wrong, and only by exact-string   */
/* replacement of a snippet that occurs exactly once.                  */
/*                                                                     */
/* Applying patches is deterministic string surgery — no second model */
/* call, no rewrite, no drift. If ANY snippet fails to match exactly   */
/* once, the whole patch set is discarded: a partial apply would leave */
/* a card half-corrected, and a paraphrase would silently corrupt it.  */
/* The caller then regenerates instead.                                */
/*                                                                     */
/* One pass, by product decision: a second review doubles the wait for */
/* a card to become readable, and the wait is the retention risk.      */
/* ------------------------------------------------------------------ */

export type ReviewPatch = {
  /* What is wrong, one line — for the log and for feedback triage. */
  issue?: string;
  /* Exact text from the document. Must occur exactly once. */
  find?: string;
  /* The same text with the defect corrected. */
  replace?: string;
};

export type ReviewVerdict = {
  verdict?: string;
  patches?: unknown;
};

export type ReviewOutcome =
  | { status: "sound" }
  | { status: "patched"; html: string; applied: number }
  /* The reviewer found a defect it could not express as a safe patch. */
  | { status: "unpatchable"; reason: string }
  /* Nothing usable came back; keep the card as-is. */
  | { status: "skipped"; reason: string };

/* Applies every patch or none. Exported for the tests: the all-or-nothing
   rule and the uniqueness requirement are the contract, not an
   implementation detail. */
export function applyPatches(
  document: string,
  patches: ReviewPatch[],
): { ok: true; next: string; applied: number } | { ok: false; reason: string } {
  let next = document;
  let applied = 0;

  for (const patch of patches) {
    const find = typeof patch.find === "string" ? patch.find : "";
    const replace = typeof patch.replace === "string" ? patch.replace : "";

    /* An empty find is the reviewer's way of saying "wrong but not
       patchable" — the caller regenerates rather than guess. */
    if (!find.trim()) {
      return { ok: false, reason: patch.issue || "unpatchable defect" };
    }

    const first = next.indexOf(find);
    if (first === -1) {
      return { ok: false, reason: "patch snippet not found verbatim" };
    }
    /* Uniqueness: a snippet that appears twice cannot be targeted, and
       replacing the first occurrence would be a coin flip. */
    if (next.indexOf(find, first + 1) !== -1) {
      return { ok: false, reason: "patch snippet is not unique" };
    }

    next = next.slice(0, first) + replace + next.slice(first + find.length);
    applied += 1;
  }

  return { ok: true, next, applied };
}

export async function reviewCard(
  card: HtmlCard,
  notes: string,
  topic: string,
): Promise<ReviewOutcome> {
  /* The document the learner actually receives — assets and all. */
  const document = buildCardDocument(card.html);

  try {
    const raw = await chatJson<ReviewVerdict>(
      [
        { role: "system", content: CARD_REVIEW_SYSTEM },
        { role: "user", content: cardReviewUser(document, notes, topic) },
      ],
      {
        maxTokens: 16000,
        temperature: 0.1,
        model: reviewModel(),
        maxAttempts: 2,
      },
    );

    if (String(raw.verdict) !== "wrong") return { status: "sound" };

    const patches = Array.isArray(raw.patches)
      ? (raw.patches as ReviewPatch[]).filter(
          (item) => item && typeof item === "object",
        )
      : [];

    if (!patches.length) {
      return { status: "skipped", reason: "wrong verdict with no patches" };
    }

    const result = applyPatches(document, patches);
    if (!result.ok) {
      return { status: "unpatchable", reason: result.reason };
    }

    console.log(
      `[clickpoint] review patched ${result.applied} defect(s): ${patches
        .map((patch) => patch.issue)
        .filter(Boolean)
        .join("; ")}`,
    );

    /* The patches are exact replacements on the full document, so the
       card's fragment is the same document minus the host chrome. We
       therefore re-extract the fragment by rebuilding from the patched
       document's own body between the marker scripts. Simplest correct
       approach: patch the fragment directly with the same operations. */
    const fragment = applyPatches(card.html, patches);
    if (!fragment.ok) {
      return { status: "unpatchable", reason: fragment.reason };
    }

    return { status: "patched", html: fragment.next, applied: result.applied };
  } catch (error) {
    /* Review is an enhancement: a failure must never cost the card. */
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[clickpoint] review skipped: ${reason}`);
    return { status: "skipped", reason };
  }
}
