import type { FeedbackKind } from "./types";

/* Body limits, in the client-safe module because the form enforces them too
   (the counter and maxLength) and the server must agree. */
export const FEEDBACK_MIN = 4;
export const FEEDBACK_MAX = 4_000;

/* ------------------------------------------------------------------ */
/* What a report can be ABOUT.                                         */
/*                                                                     */
/* Client-safe on purpose: this module imports nothing but a type, so   */
/* the form can render the catalogue without pulling in the hashing and */
/* validation module (which imports node:crypto and must stay on the    */
/* server). The server validates against this same list, so the two     */
/* cannot disagree about what a valid report is.                        */
/*                                                                     */
/* The ask is narrowed per surface on purpose: a card page asks about    */
/* the card, not "how are we doing". The generic box is the last resort, */
/* not the default.                                                     */
/* ------------------------------------------------------------------ */

export type FeedbackTargetId =
  | "card-wrong"
  | "card-unclear"
  | "quiz-answer"
  | "pathway-broken"
  | "bug"
  | "idea"
  | "general";

export type FeedbackTarget = {
  id: FeedbackTargetId;
  kind: FeedbackKind;
  /* Shown as the option label. */
  label: string;
  /* The body field's placeholder, phrased as the question this answer is for. */
  prompt: string;
};

export const FEEDBACK_TARGETS: FeedbackTarget[] = [
  {
    id: "card-wrong",
    kind: "card",
    label: "This card is wrong",
    prompt: "Which statement or formula is wrong, and what should it say?",
  },
  {
    id: "card-unclear",
    kind: "card",
    label: "This card is unclear",
    prompt: "Which part lost you? Quote it if you can.",
  },
  {
    id: "quiz-answer",
    kind: "quiz",
    label: "A question or answer key is wrong",
    prompt: "Which question, and what did you answer instead?",
  },
  {
    id: "pathway-broken",
    kind: "bug",
    label: "This pathway is broken",
    prompt: "What did you expect, and what happened?",
  },
  {
    id: "bug",
    kind: "bug",
    label: "Something is broken",
    prompt: "What did you expect, and what happened?",
  },
  {
    id: "idea",
    kind: "idea",
    label: "An idea",
    prompt: "What would make this better?",
  },
  {
    id: "general",
    kind: "general",
    label: "Something else",
    prompt: "Tell us whatever is on your mind.",
  },
];

/* Distinct kinds, derived from the catalogue so adding a target cannot produce
   a kind the server would reject. */
export const FEEDBACK_KINDS: readonly FeedbackKind[] = Array.from(
  new Set(FEEDBACK_TARGETS.map((target) => target.kind)),
);

export function isFeedbackKind(value: string): value is FeedbackKind {
  return FEEDBACK_KINDS.includes(value as FeedbackKind);
}
