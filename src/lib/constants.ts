export const GUEST_COOKIE = "clickpoint_guest";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export const FINISH_LESSON_XP = 10;
export const CORRECT_ANSWER_XP = 5;
export const QUIZ_PASS_THRESHOLD = 0.75;

/* The card's own reward, before the checkpoint: reading it is worth as much
   as the checkpoint, because reading it IS the lesson. Shown as a live
   counter so the card feels like progress, not a wall of text. */
export const CARD_READ_XP = 10;

export const MIN_LESSONS = 2;
export const MAX_LESSONS = 10;
export const QUESTIONS_PER_QUIZ = 8;

/* Hearts in the checkpoint. Three misses ends the run — the same stakes
   the reference design uses, which keeps each question consequential
   without making a single slip fatal. */
export const QUIZ_LIVES = 3;

/* Quota: this many new pathways per guest per rolling window. Each pathway
   fires an outline, a banner, and a card + quiz per lesson, so this is the
   knob that caps LLM spend. Set high enough that the gate is effectively
   open while the machinery stays in place; drop it later if budget bites.

   Every headline number on the landing page and in the gate copy is derived
   from these two, so a rule change cannot leave stale copy behind. */
export const PATHWAYS_PER_DAY = 10_000;
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

/* Ceiling on the notes one pathway may be built from. The notes are re-sent to
   the model for every card AND every quiz (up to MAX_LESSONS of each), so cost
   scales with lessons x notes: doubling the notes roughly doubles the input
   tokens of 20-40 calls. Refusing at the door is cheaper than a half-generated
   pathway, and the message tells the user exactly what to do about it. */
export const MAX_NOTES_CHARS = 80_000;

/* One file per upload is not a real limit — a unit's notes are usually a
   lecture PDF plus a problem set. This is where the form stops, chosen to keep
   a single request inside the route's 300s budget. */
export const MAX_UPLOAD_FILES = 6;
