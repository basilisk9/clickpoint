import { describe, expect, it } from "vitest";
import { UPLOAD_STAGES, stageIndexFor, stageProgress, stageStates } from "./uploadStages";
import { checkPathwayQuota, formatWait, quotaFrom } from "./ratelimit";
import { quotaGate } from "./progress";
import { PATHWAYS_PER_DAY, QUOTA_WINDOW_MS } from "./constants";

/* ------------------------------------------------------------------ */
/* Cross-module agreement.                                             */
/*                                                                     */
/* The frontend gate and the server-side limiter must answer the same  */
/* question about the same rows. They cannot disagree about the RULE   */
/* any more — progress.ts calls this module's `quotaFrom` — so what    */
/* these tests pin is the wiring: that the gate is a faithful read of  */
/* the check, and that the messages agree with it.                      */
/*                                                                     */
/* If they ever diverge again, the UI either blocks a user the API     */
/* would allow (lost product) or invites one the API will reject (a    */
/* 429 after a long wait).                                             */
/* ------------------------------------------------------------------ */

describe("client gate agrees with the server quota check", () => {
  const NOW = Date.parse("2026-06-01T12:00:00.000Z");
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  const cases: { label: string; starts: string[] }[] = [
    { label: "never generated", starts: [] },
    { label: "one a minute ago", starts: [ago(60_000)] },
    {
      label: "one below the limit",
      starts: Array.from({ length: PATHWAYS_PER_DAY - 1 }, (_, i) => ago((i + 1) * 60_000)),
    },
    {
      label: "exactly at the limit",
      starts: Array.from({ length: PATHWAYS_PER_DAY }, (_, i) => ago((i + 1) * 60_000)),
    },
    {
      label: "at the limit but the oldest has aged out",
      starts: Array.from({ length: PATHWAYS_PER_DAY }, (_, i) =>
        ago(i === 0 ? QUOTA_WINDOW_MS + 1 : (i + 1) * 60_000),
      ),
    },
    { label: "garbage timestamps", starts: ["garbage", ""] },
    {
      label: "everything older than the window",
      starts: [ago(2 * QUOTA_WINDOW_MS), ago(3 * QUOTA_WINDOW_MS)],
    },
  ];

  for (const { label, starts } of cases) {
    it(`matches for: ${label}`, () => {
      const server = checkPathwayQuota(starts, NOW);
      const client = quotaGate(starts, NOW);
      /* Server `allowed` must be the exact inverse of client `locked`. */
      expect(client.locked).toBe(server.allowed === false);
      expect(client.used).toBe(server.used);
      expect(client.remaining).toBe(server.remaining);
    });
  }

  it("reports the same retry instant as the server", () => {
    const starts = Array.from({ length: PATHWAYS_PER_DAY }, (_, i) => ago((i + 1) * 3600_000));
    const server = checkPathwayQuota(starts, NOW);
    const client = quotaGate(starts, NOW);
    if (server.allowed) throw new Error("expected a blocked server check");
    expect(client.retryAt).toBe(server.retryAt);
  });

  it("formats the same wait string as the server", () => {
    /* The gate and the 429 body must not disagree about the countdown, or the
       form would say one thing and the API another. */
    for (const age of [60_000, 900_000, 3600_000, 6 * 3600_000 + 120_000]) {
      const starts = Array.from({ length: PATHWAYS_PER_DAY }, () => ago(age));
      const server = checkPathwayQuota(starts, NOW);
      const client = quotaGate(starts, NOW);
      if (server.allowed) throw new Error("expected a blocked server check");
      expect(server.message).toContain(client.wait ?? "");
      expect(client.wait).toBe(formatWait(QUOTA_WINDOW_MS - age));
    }
  });

  it("counts rows, not time: two starts an hour apart still spent two slots", () => {
    const state = quotaFrom([ago(3600_000), ago(60_000)], NOW);
    expect(state.used).toBe(2);
    expect(state.remaining).toBe(PATHWAYS_PER_DAY - 2);
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

  it("gives reading several files longer than the single-file estimate", () => {
    /* Multi-file uploads are read sequentially, so the first stage's bound has
       to clear more than one PDF or the checklist sits on stage 1 past its own
       upper bound. */
    expect(UPLOAD_STAGES[0].until).toBeGreaterThanOrEqual(10_000);
  });
});
