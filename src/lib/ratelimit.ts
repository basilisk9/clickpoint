import { PATHWAYS_PER_DAY, QUOTA_WINDOW_MS } from "./constants";

/* ------------------------------------------------------------------ */
/* The pathway quota.                                                  */
/*                                                                     */
/* "N per rolling 24h", counted from the pathway_starts table rather    */
/* than from a single last-generated timestamp. A timestamp can only    */
/* express "1 per window", and rewriting it into a counter in the guest */
/* row would make it a read-modify-write: two concurrent generations    */
/* could then either lose a stamp (a free pathway) or double-add one    */
/* (a lost pathway, the worse failure). Rows appended by the database   */
/* cannot race.                                                        */
/*                                                                     */
/* This module stays PURE and free of any database or Next import, so   */
/* the client-side gate (progress.ts) calls the exact same counting     */
/* code instead of reimplementing the rule. That is the whole reason    */
/* the two can no longer disagree.                                     */
/* ------------------------------------------------------------------ */

export type QuotaState = {
  /* Starts counted inside the window. */
  used: number;
  /* Slots left in the window. */
  remaining: number;
  /* When the OLDEST counted start ages out: the instant the next slot frees.
     Null when nothing is counted. */
  nextAt: string | null;
};

export type QuotaCheck =
  | ({ allowed: true } & QuotaState)
  | ({ allowed: false; retryAt: string; message: string } & QuotaState);

/* "2h 15m", "45m", "30s" — readable at a glance, never "0h 0m". */
export function formatWait(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/* Counts the starts that are still inside the window. A missing or
   unparseable timestamp is dropped rather than counted: bad data must never
   lock a user out of the product, and a dropped row can only ever be more
   generous, never less. */
export function quotaFrom(
  starts: readonly string[] | null | undefined,
  now: number = Date.now(),
  limit: number = PATHWAYS_PER_DAY,
): QuotaState {
  const cutoff = now - QUOTA_WINDOW_MS;
  const inside = (starts ?? [])
    .map((value) => Date.parse(value))
    .filter((time) => Number.isFinite(time) && time > cutoff)
    .sort((a, b) => a - b);

  const used = inside.length;
  return {
    used,
    remaining: Math.max(0, limit - used),
    nextAt: used > 0 ? new Date(inside[0] + QUOTA_WINDOW_MS).toISOString() : null,
  };
}

export function checkPathwayQuota(
  starts: readonly string[] | null | undefined,
  now: number = Date.now(),
  limit: number = PATHWAYS_PER_DAY,
): QuotaCheck {
  const state = quotaFrom(starts, now, limit);
  if (state.remaining > 0) return { allowed: true, ...state };

  const retryAt = state.nextAt ?? new Date(now + QUOTA_WINDOW_MS).toISOString();
  return {
    allowed: false,
    ...state,
    retryAt,
    message: `The next pathway opens in ${formatWait(Date.parse(retryAt) - now)}.`,
  };
}
