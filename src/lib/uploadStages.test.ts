import { describe, expect, it } from "vitest";
import {
  UPLOAD_STAGES,
  currentStage,
  stageIndexFor,
  stageProgress,
  stageStates,
} from "./uploadStages";

/* ------------------------------------------------------------------ */
/* The upload stage estimator.                                         */
/*                                                                     */
/* These tests encode the two things that were wrong before: the wait  */
/* was silent, and the wait must never claim to be over while the      */
/* request is still open.                                              */
/* ------------------------------------------------------------------ */

describe("stageIndexFor", () => {
  it("starts on the reading stage at time zero", () => {
    expect(stageIndexFor(0)).toBe(0);
  });

  it("advances through stages as time passes", () => {
    expect(stageIndexFor(1_000)).toBe(0);
    expect(stageIndexFor(UPLOAD_STAGES[0].until)).toBe(1);
    expect(stageIndexFor(UPLOAD_STAGES[1].until)).toBe(2);
  });

  it("holds on the final stage past the estimate instead of resetting", () => {
    /* A slow run must not flicker back to stage 1 and look like a restart. */
    const last = UPLOAD_STAGES.length - 1;
    expect(stageIndexFor(UPLOAD_STAGES[last].until)).toBe(last);
    expect(stageIndexFor(600_000)).toBe(last);
    expect(stageIndexFor(Number.MAX_SAFE_INTEGER)).toBe(last);
  });

  it("treats a negative elapsed as the first stage", () => {
    expect(stageIndexFor(-5_000)).toBe(0);
  });
});

describe("currentStage", () => {
  it("returns a stage with a non-empty label at every point", () => {
    for (const ms of [0, 500, 4_000, 18_000, 59_999, 500_000]) {
      expect(currentStage(ms).label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("stageProgress", () => {
  it("starts near zero", () => {
    expect(stageProgress(0)).toBe(0);
  });

  it("never reaches 1 while the request is still open", () => {
    /* The whole point: a full bar before the response lands is a lie. */
    expect(stageProgress(60_000)).toBeLessThan(1);
    expect(stageProgress(60_000)).toBeCloseTo(0.95, 5);
    expect(stageProgress(9_999_999)).toBeLessThanOrEqual(0.95);
  });

  it("increases monotonically", () => {
    let previous = -1;
    for (let ms = 0; ms <= 60_000; ms += 1_000) {
      const value = stageProgress(ms);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("clamps a negative elapsed to zero rather than going negative", () => {
    expect(stageProgress(-1_000)).toBe(0);
  });
});

describe("stageStates", () => {
  it("marks earlier stages done, one active, and later ones pending", () => {
    const states = stageStates(UPLOAD_STAGES[1].until);
    expect(states).toHaveLength(UPLOAD_STAGES.length);
    expect(states[0].state).toBe("done");
    expect(states[1].state).toBe("done");
    expect(states[2].state).toBe("active");
    expect(states.filter((item) => item.state === "active")).toHaveLength(1);
  });

  it("has exactly one active stage at all times", () => {
    for (const ms of [0, 3_999, 4_000, 17_999, 18_000, 200_000]) {
      const active = stageStates(ms).filter((item) => item.state === "active");
      expect(active).toHaveLength(1);
    }
  });

  it("preserves the declared stage order", () => {
    const ids = stageStates(0).map((item) => item.stage.id);
    expect(ids).toEqual(["reading", "outline", "card1"]);
  });
});
