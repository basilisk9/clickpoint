/* ------------------------------------------------------------------ */
/* Upload stages.                                                      */
/*                                                                     */
/* The landing page promises "you wait only for the first lesson", but */
/* the upload button used to sit on one frozen sentence for 30-60s. A  */
/* frozen button reads as broken. The server does three things in      */
/* order — read the notes, draw the syllabus + banner, write card 1 —  */
/* and the client cannot see inside that, so this drives an honest     */
/* elapsed-time estimate over those three named stages.                */
/*                                                                     */
/* It is an estimate and the copy says so ("usually"): pretending to
   know the real server step would be a lie the first slow run exposes.

   The first bound covers reading several files one after another, not one
   PDF: a unit's notes arrive as a lecture deck plus a problem set, and unpdf
   is the slowest part of the request. */
/* ------------------------------------------------------------------ */

export type UploadStage = {
  id: "reading" | "outline" | "card1";
  label: string;
  /* Upper bound of this stage in ms, used to advance the estimate. */
  until: number;
};

export const UPLOAD_STAGES: readonly UploadStage[] = [
  { id: "reading", label: "Reading your notes", until: 12_000 },
  { id: "outline", label: "Drawing the syllabus and banner", until: 26_000 },
  { id: "card1", label: "Writing cards", until: 60_000 },
] as const;

/* Stage index for a given elapsed time. Clamped to the last stage so a run
   that overshoots the estimate holds on "Writing card 1" instead of
   flickering back to a completed state. */
export function stageIndexFor(elapsedMs: number): number {
  const elapsed = Math.max(0, elapsedMs);
  for (let i = 0; i < UPLOAD_STAGES.length; i += 1) {
    if (elapsed < UPLOAD_STAGES[i].until) return i;
  }
  return UPLOAD_STAGES.length - 1;
}

export function currentStage(elapsedMs: number): UploadStage {
  return UPLOAD_STAGES[stageIndexFor(elapsedMs)];
}

/* 0-1 across the whole estimate, capped below 1 so the bar never claims to be
   finished while the request is still open. The last 5% is the server's. */
export function stageProgress(elapsedMs: number): number {
  const total = UPLOAD_STAGES[UPLOAD_STAGES.length - 1].until;
  const ratio = Math.max(0, Math.min(elapsedMs, total)) / total;
  return Math.min(0.95, ratio * 0.95);
}

/* Which stages are behind us, for rendering the checklist. The active stage is
   not "done", so a three-item list shows done / active / pending. */
export function stageStates(elapsedMs: number): {
  stage: UploadStage;
  state: "done" | "active" | "pending";
}[] {
  const active = stageIndexFor(elapsedMs);
  return UPLOAD_STAGES.map((stage, index) => ({
    stage,
    state: index < active ? "done" : index === active ? "active" : "pending",
  }));
}
