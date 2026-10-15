import { PATHWAY_COOLDOWN_MS } from "./constants";
import type { GuestRecord } from "./types";

export type RateLimitCheck =
  | { allowed: true }
  | { allowed: false; retryAt: string; message: string };

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

/* One pathway per guest per rolling 24h. A missing or unparseable timestamp
   is treated as "never generated", so old records and bad data never lock a
   user out. */
export function checkPathwayLimit(guest: GuestRecord, now = Date.now()): RateLimitCheck {
  const last = guest.lastPathwayAt ? Date.parse(guest.lastPathwayAt) : NaN;
  if (Number.isNaN(last)) return { allowed: true };

  const elapsed = now - last;
  if (elapsed >= PATHWAY_COOLDOWN_MS) return { allowed: true };

  const remaining = PATHWAY_COOLDOWN_MS - elapsed;
  return {
    allowed: false,
    retryAt: new Date(last + PATHWAY_COOLDOWN_MS).toISOString(),
    message: `You've already built a pathway today. You can build your next one in ${formatWait(remaining)}.`,
  };
}
