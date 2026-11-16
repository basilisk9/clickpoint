import { createHash } from "crypto";
import { FEEDBACK_KINDS, FEEDBACK_MAX, FEEDBACK_MIN } from "./feedbackTargets";
import type { FeedbackInput, FeedbackKind } from "./types";

/* ------------------------------------------------------------------ */
/* Feedback intake.                                                    */
/*                                                                     */
/* Validation and shaping only — pure and database-free, so the rules  */
/* are testable without a server, the same split grade.ts and          */
/* ratelimit.ts use.                                                    */
/*                                                                     */
/* The write is made IDEMPOTENT by the client: it mints a timestamp,   */
/* sends it, and retries with the same one, so a send that succeeded   */
/* but whose response was lost does not leave two rows behind.         */
/* ------------------------------------------------------------------ */

/* Ten seconds between reports. The form is for a human, not a script, so this
   only has to stop a held-down button or a retry loop from filling the table —
   while still letting someone report a second thing right after the first. */
export const FEEDBACK_THROTTLE_MS = 10_000;

export function normalizeFeedbackKind(value: unknown): FeedbackKind {
  const raw = String(value ?? "").trim().toLowerCase();
  return FEEDBACK_KINDS.includes(raw as FeedbackKind)
    ? (raw as FeedbackKind)
    : "general";
}

function optionalText(value: unknown, max: number): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
}

export type FeedbackValidation =
  | { ok: true; value: FeedbackInput }
  | { ok: false; error: string };

export function validateFeedback(raw: unknown): FeedbackValidation {
  const body = (raw ?? {}) as Record<string, unknown>;
  const text = typeof body.body === "string" ? body.body.trim() : "";

  if (text.length < FEEDBACK_MIN) {
    return { ok: false, error: "Add a little more detail so it is actionable." };
  }
  if (text.length > FEEDBACK_MAX) {
    return { ok: false, error: `Keep it under ${FEEDBACK_MAX} characters.` };
  }

  return {
    ok: true,
    value: {
      kind: normalizeFeedbackKind(body.kind),
      body: text,
      /* Length-capped because they are only ever pointers for a human reading
         the table; nothing resolves them. */
      pathwayId: optionalText(body.pathwayId, 64),
      nodeId: optionalText(body.nodeId, 64),
      pageUrl: optionalText(body.pageUrl, 300),
    },
  };
}

/* The client's own clock, in milliseconds. Absent or unparseable is NaN, which
   callers read as "no stamp" — treated as sendable rather than as an error, so
   a missing field cannot cost someone their report. */
export function parseClientStamp(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

export function isFeedbackThrottled(
  lastStamp: number,
  now: number = Date.now(),
): boolean {
  if (!Number.isFinite(lastStamp)) return false;
  return now - lastStamp < FEEDBACK_THROTTLE_MS;
}

/* Deterministic per (guest, stamp), so a retry of the same report maps to the
   same row and a genuinely new report a minute later does not. */
export function feedbackId(guestId: string, stamp: number): string {
  const digest = createHash("sha256")
    .update(`${guestId}:${stamp}`)
    .digest("hex")
    .slice(0, 16);
  return `fb_${digest}`;
}
