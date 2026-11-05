import { describe, expect, it } from "vitest";
import { UPLOAD_STAGES, stageIndexFor, stageProgress, stageStates } from "./uploadStages";
import { checkPathwayLimit } from "./ratelimit";
import { formatCountdown, dailyGate } from "./progress";
import { PATHWAY_COOLDOWN_MS } from "./constants";

/* ------------------------------------------------------------------ */
/* Cross-module agreement.                                             */
/*                                                                     */
/* The frontend gate and the server-side rate limiter are separate     */
/* implementations of "one pathway per day". If they ever disagree,    */
/* the UI either blocks a user the API would allow (lost product) or   */
/* invites a user the API will reject (a 429 after a long wait). These */
/* tests pin them to each other.                                       */
/* ------------------------------------------------------------------ */

describe("client gate agrees with the server rate limit", () => {
  const NOW = Date.parse("2026-06-01T12:00:00.000Z");

  const cases: { label: string; lastPathwayAt: string | undefined }[] = [
    { label: "never generated", lastPathwayAt: undefined },
    { label: "just generated", lastPathwayAt: new Date(NOW - 60_000).toISOString() },
    { label: "one hour ago", lastPathwayAt: new Date(NOW - 3600_000).toISOString() },
    { label: "23h 59m ago", lastPathwayAt: new Date(NOW - 86_340_000).toISOString() },
    { label: "exactly 24h ago", lastPathwayAt: new Date(NOW - PATHWAY_COOLDOWN_MS).toISOString() },
    { label: "two days ago", lastPathwayAt: new Date(NOW - 2 * PATHWAY_COOLDOWN_MS).toISOString() },
    { label: "unparseable timestamp", lastPathwayAt: "garbage" },
    { label: "empty timestamp", lastPathwayAt: "" },
  ];

  for (const { label, lastPathwayAt } of cases) {
    it(`matches for: ${label}`, () => {
      const server = checkPathwayLimit(
        { id: "g1", createdAt: "x", pathwayIds: [], lastPathwayAt },
        NOW,
      );
      const client = dailyGate(lastPathwayAt, PATHWAY_COOLDOWN_MS, NOW);
      /* Server `allowed` must be the exact inverse of client `locked`. */
      expect(client.locked).toBe(server.allowed === false);
    });
  }

  it("reports the same retry instant as the server", () => {
    const last = new Date(NOW - 4 * 3600_000).toISOString();
    const server = checkPathwayLimit(
      { id: "g1", createdAt: "x", pathwayIds: [], lastPathwayAt: last },
      NOW,
    );
    const client = dailyGate(last, PATHWAY_COOLDOWN_MS, NOW);
    if (server.allowed) throw new Error("expected a blocked server check");
    expect(client.retryAt).toBe(server.retryAt);
  });

  it("formats the same wait string as the server", () => {
    /* Both modules expose a formatter; the two must produce identical copy or
       the upload panel and the 429 message would disagree. */
    for (const ago of [60_000, 900_000, 3600_000, 6 * 3600_000 + 120_000]) {
      const last = new Date(NOW - ago).toISOString();
      const server = checkPathwayLimit(
        { id: "g1", createdAt: "x", pathwayIds: [], lastPathwayAt: last },
        NOW,
      );
      if (server.allowed) throw new Error("expected a blocked server check");
      expect(server.message).toContain(formatCountdown(PATHWAY_COOLDOWN_MS - ago));
    }
  });
});

/* ------------------------------------------------------------------ */
/* Upload stage boundaries.                                            */
/* ------------------------------------------------------------------ */

describe("stage boundary behaviour", () => {
  it("advances exactly at each declared boundary and not a millisecond before", () => {
    for (let i = 0; i < UPLOAD_STAGES.length; i += 1) {
      const boundary = UPLOAD_STAGES[i].until;
      expect(stageIndexFor(boundary - 1)).toBe(i);
      if (i < UPLOAD_STAGES.length - 1) {
        expect(stageIndexFor(boundary)).toBe(i + 1);
      }
    }
  });

  it("returns a finite number for every elapsed value", () => {
    for (const ms of [0, 1, 3_999, 4_000, 17_999, 18_000, 59_999, 60_000, 1e9, -1e9]) {
      const value = stageProgress(ms);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the stage list immutable in shape", () => {
    expect(UPLOAD_STAGES).toHaveLength(3);
    expect(UPLOAD_STAGES.map((stage) => stage.id)).toEqual(["reading", "outline", "card1"]);
    /* Each `until` must increase, or the index loop would skip a stage. */
    const bounds = UPLOAD_STAGES.map((stage) => stage.until);
    expect(bounds).toEqual([...bounds].sort((a, b) => a - b));
    expect(new Set(bounds).size).toBe(bounds.length);
  });

  it("shows the first stage as active and later ones pending at time zero", () => {
    const states = stageStates(0);
    expect(states[0].state).toBe("active");
    expect(states.slice(1).every((item) => item.state === "pending")).toBe(true);
  });
});
