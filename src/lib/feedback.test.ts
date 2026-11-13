import { describe, expect, it } from "vitest";
import {
  FEEDBACK_MAX,
  FEEDBACK_MIN,
  FEEDBACK_KINDS,
  FEEDBACK_TARGETS,
  isFeedbackKind,
} from "./feedbackTargets";
import {
  FEEDBACK_THROTTLE_MS,
  feedbackId,
  isFeedbackThrottled,
  normalizeFeedbackKind,
  parseClientStamp,
  validateFeedback,
} from "./feedback";

/* ------------------------------------------------------------------ */
/* Intake rules. The form and the API enforce the same limits, and the */
/* limits live in the client-safe module precisely so they cannot      */
/* drift — these tests are what keeps that true.                       */
/* ------------------------------------------------------------------ */

describe("feedback limits", () => {
  it("keeps every target's kind inside the accepted set", () => {
    for (const target of FEEDBACK_TARGETS) {
      expect(isFeedbackKind(target.kind)).toBe(true);
    }
  });

  it("derives the kind list from the catalogue instead of restating it", () => {
    const fromTargets = new Set(FEEDBACK_TARGETS.map((target) => target.kind));
    expect(new Set(FEEDBACK_KINDS)).toEqual(fromTargets);
  });

  it("asks a specific question on every target", () => {
    for (const target of FEEDBACK_TARGETS) {
      expect(target.label.trim().length).toBeGreaterThan(0);
      expect(target.prompt.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeFeedbackKind", () => {
  it("accepts a known kind and trims case", () => {
    expect(normalizeFeedbackKind("BUG")).toBe("bug");
    expect(normalizeFeedbackKind(" quiz ")).toBe("quiz");
  });

  it("falls back to general rather than rejecting an unknown kind", () => {
    /* A kind the server does not know is a stale client, not a bad report, so
       the report is still kept. */
    expect(normalizeFeedbackKind("nonsense")).toBe("general");
    expect(normalizeFeedbackKind(undefined)).toBe("general");
    expect(normalizeFeedbackKind(42)).toBe("general");
  });
});

describe("validateFeedback", () => {
  const body = "The second step drops a minus sign.";

  it("accepts a useful report and keeps the anchor ids", () => {
    const result = validateFeedback({
      kind: "card",
      body,
      pathwayId: "path_1",
      nodeId: "card_2",
      pageUrl: "/path/path_1/card/card_2",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value).toEqual({
      kind: "card",
      body,
      pathwayId: "path_1",
      nodeId: "card_2",
      pageUrl: "/path/path_1/card/card_2",
    });
  });

  it("rejects an empty or too-short body", () => {
    expect(validateFeedback({ body: "" }).ok).toBe(false);
    expect(validateFeedback({ body: "   " }).ok).toBe(false);
    expect(validateFeedback({ body: "a".repeat(FEEDBACK_MIN - 1) }).ok).toBe(false);
    expect(validateFeedback({ body: "a".repeat(FEEDBACK_MIN) }).ok).toBe(true);
    expect(validateFeedback({}).ok).toBe(false);
  });

  it("rejects an oversized body instead of silently truncating it", () => {
    const result = validateFeedback({ body: "a".repeat(FEEDBACK_MAX + 1) });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain(String(FEEDBACK_MAX));
  });

  it("trims the body and drops blank optional fields", () => {
    const result = validateFeedback({ body: `  ${body}  `, pathwayId: "   " });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.body).toBe(body);
    expect(result.value.pathwayId).toBeUndefined();
  });

  it("caps the pointer fields rather than storing an unbounded string", () => {
    const result = validateFeedback({ body, pageUrl: "x".repeat(5_000) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.pageUrl).toHaveLength(300);
  });
});

describe("parseClientStamp", () => {
  it("reads a number or a numeric string", () => {
    expect(parseClientStamp(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(parseClientStamp("1700000000000")).toBe(1_700_000_000_000);
  });

  it("returns NaN for anything unusable, which callers read as sendable", () => {
    expect(Number.isNaN(parseClientStamp(undefined))).toBe(true);
    expect(Number.isNaN(parseClientStamp(""))).toBe(true);
    expect(Number.isNaN(parseClientStamp("soon"))).toBe(true);
    expect(Number.isNaN(parseClientStamp(Infinity))).toBe(true);
  });
});

describe("isFeedbackThrottled", () => {
  const NOW = Date.parse("2026-06-01T12:00:00.000Z");

  it("allows the first report when there is no previous one", () => {
    expect(isFeedbackThrottled(NaN, NOW)).toBe(false);
  });

  it("blocks inside the window and allows at the boundary", () => {
    expect(isFeedbackThrottled(NOW - 1_000, NOW)).toBe(true);
    expect(isFeedbackThrottled(NOW - FEEDBACK_THROTTLE_MS + 1, NOW)).toBe(true);
    expect(isFeedbackThrottled(NOW - FEEDBACK_THROTTLE_MS, NOW)).toBe(false);
    expect(isFeedbackThrottled(NOW - FEEDBACK_THROTTLE_MS - 1, NOW)).toBe(false);
  });
});

describe("feedbackId", () => {
  it("is stable for the same guest and stamp, so a retry is one row", () => {
    expect(feedbackId("gst_1", 1234)).toBe(feedbackId("gst_1", 1234));
  });

  it("differs across guests and across stamps", () => {
    expect(feedbackId("gst_1", 1234)).not.toBe(feedbackId("gst_2", 1234));
    expect(feedbackId("gst_1", 1234)).not.toBe(feedbackId("gst_1", 1235));
  });

  it("is a valid short id, not the raw inputs", () => {
    const id = feedbackId("gst_1", 1234);
    expect(id).toMatch(/^fb_[0-9a-f]{16}$/);
    expect(id).not.toContain("1234");
  });
});
