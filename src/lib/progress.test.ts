import { describe, expect, it } from "vitest";
import {
  bannerState,
  describeQuota,
  firstOpenCard,
  focusNodeId,
  nextNode,
  quotaGate,
  readyCardCount,
  summarizeProgress,
  totalCardCount,
} from "./progress";
import { QUOTA_WINDOW_MS } from "./constants";
import { formatWait } from "./ratelimit";
import type { PathwayNode, PathwayRecord } from "./types";

/* The production limit is set high enough to be effectively unlimited.
   These tests use a small local limit to keep the boundary cases fast
   and deterministic. */
const TEST_LIMIT = 3;

/* ------------------------------------------------------------------ */
/* Fixtures. Deliberately minimal: only the fields the progress code is */
/* allowed to read, so a future change to PathwayRecord that starts    */
/* depending on something new will fail loudly here.                   */
/* ------------------------------------------------------------------ */

function node(overrides: Partial<PathwayNode> & { id: string }): PathwayNode {
  return {
    kind: "card",
    lessonIndex: 0,
    title: overrides.id,
    subtitle: "",
    status: "locked",
    card: { title: overrides.id } as PathwayNode["card"],
    ...overrides,
  };
}

function quizNode(overrides: Partial<PathwayNode> & { id: string }): PathwayNode {
  return node({
    kind: "quiz",
    card: undefined,
    quiz: { questions: [] },
    ...overrides,
  });
}

function pathway(overrides: Partial<PathwayRecord> = {}): PathwayRecord {
  return {
    id: "p1",
    guestId: "g1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "ready",
    rawNotes: "",
    outline: {
      lessonCount: 1,
      subject: "Physics",
      unitLabel: "UNIT",
      sourceTag: "notes",
      lessons: [],
    },
    banner: {
      title: "Physics",
      kicker: "UNIT",
      blurb: "",
      stats: [],
      floating: [],
      bannerSvg: "",
      bannerCaption: "",
    },
    nodes: [],
    xp: 0,
    completedNodeIds: [],
    ...overrides,
  };
}

/* card, quiz, card, quiz — the shape pipeline.ts actually builds. */
function fourNodePathway(): PathwayRecord {
  return pathway({
    nodes: [
      node({ id: "c1", lessonIndex: 0, status: "complete" }),
      quizNode({ id: "q1", lessonIndex: 0, status: "complete" }),
      node({ id: "c2", lessonIndex: 1, status: "generating" }),
      quizNode({ id: "q2", lessonIndex: 1, status: "locked" }),
    ],
    completedNodeIds: ["c1", "q1"],
  });
}

/* ------------------------------------------------------------------ */
/* summarizeProgress                                                   */
/* ------------------------------------------------------------------ */

describe("summarizeProgress", () => {
  it("counts each status bucket exactly once", () => {
    const summary = summarizeProgress(fourNodePathway());
    expect(summary.total).toBe(4);
    expect(summary.completed).toBe(2);
    expect(summary.generating).toBe(1);
    expect(summary.locked).toBe(1);
    expect(summary.ready).toBe(0);
    expect(summary.filling).toBe(true);
    expect(summary.finished).toBe(false);
  });

  it("counts a fully open pathway as all ready", () => {
    const summary = summarizeProgress(
      pathway({
        nodes: [
          node({ id: "c1", status: "available" }),
          node({ id: "c2", lessonIndex: 1, status: "available" }),
        ],
      }),
    );
    expect(summary.ready).toBe(2);
    expect(summary.completed).toBe(0);
  });

  it("treats an empty pathway as not finished rather than vacuously done", () => {
    /* total > 0 guards this: 0 of 0 completed must not read as "you finished". */
    const summary = summarizeProgress(pathway({ nodes: [] }));
    expect(summary.total).toBe(0);
    expect(summary.finished).toBe(false);
  });

  it("reports finished only when every node is complete", () => {
    const done = pathway({
      nodes: [
        node({ id: "c1", status: "complete" }),
        quizNode({ id: "q1", status: "complete" }),
      ],
      completedNodeIds: ["c1", "q1"],
    });
    expect(summarizeProgress(done).finished).toBe(true);
  });

  /* Regression: completedNodeIds is a plain array, so it can overlap nodes
     that are simultaneously locked or generating (a regenerate does exactly
     this). Subtracting the two tallies from `total` produced -2 here, which
     surfaced to the learner as "-2 of 4 ready". */
  it("never reports a negative ready count when the two tallies overlap", () => {
    const overlapping = pathway({
      nodes: [
        node({ id: "c1", status: "generating" }),
        node({ id: "c2", status: "generating" }),
        node({ id: "c3", status: "locked" }),
        node({ id: "c4", status: "locked" }),
      ],
      completedNodeIds: ["c1", "c2"],
    });
    const summary = summarizeProgress(overlapping);
    expect(summary.ready).toBe(0);
    expect(summary.ready).toBeGreaterThanOrEqual(0);
  });

  it("never counts a locked node as ready", () => {
    const summary = summarizeProgress(
      pathway({
        nodes: [
          node({ id: "c1", status: "available" }),
          node({ id: "c2", lessonIndex: 1, status: "locked" }),
          node({ id: "c3", lessonIndex: 2, status: "locked" }),
        ],
      }),
    );
    expect(summary.ready).toBe(1);
    expect(summary.locked).toBe(2);
  });

  it("ignores stale completed ids that no longer name a node", () => {
    /* A removed node leaves its id behind. Counting the array length would
       report 2 completed out of 1 node. */
    const stale = pathway({
      nodes: [node({ id: "c1", status: "complete" })],
      completedNodeIds: ["c1", "ghost"],
    });
    const summary = summarizeProgress(stale);
    expect(summary.completed).toBe(1);
    expect(summary.finished).toBe(true);
  });

  it("keeps ready within [0, total] for every status combination", () => {
    const statuses = ["locked", "available", "complete", "generating", "failed"] as const;
    for (const status of statuses) {
      const summary = summarizeProgress(
        pathway({
          nodes: [node({ id: "c1", status }), node({ id: "c2", lessonIndex: 1, status })],
          completedNodeIds: ["c1"],
        }),
      );
      expect(summary.ready).toBeGreaterThanOrEqual(0);
      expect(summary.ready).toBeLessThanOrEqual(summary.total);
    }
  });
});

/* ------------------------------------------------------------------ */
/* nextNode / focusNodeId                                              */
/* ------------------------------------------------------------------ */

describe("nextNode", () => {
  it("returns null when the only remaining node is still locked", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "complete" }),
        node({ id: "c2", status: "locked" }),
      ],
      completedNodeIds: ["c1"],
    });
    expect(nextNode(p)).toBeNull();
  });

  it("returns the first walkable incomplete node in pathway order", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "complete" }),
        quizNode({ id: "q1", status: "available" }),
        node({ id: "c2", lessonIndex: 1, status: "available" }),
      ],
      completedNodeIds: ["c1"],
    });
    expect(nextNode(p)?.id).toBe("q1");
  });

  it("never returns a generating node, because there is nothing to open yet", () => {
    const p = pathway({ nodes: [node({ id: "c1", status: "generating" })] });
    expect(nextNode(p)).toBeNull();
  });

  it("skips failed nodes so a broken card is not the suggested next step", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "failed" }),
        node({ id: "c2", lessonIndex: 1, status: "available" }),
      ],
    });
    expect(nextNode(p)?.id).toBe("c2");
  });
});

describe("focusNodeId", () => {
  it("points at the node in progress rather than the first node in the list", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "complete" }),
        node({ id: "c2", lessonIndex: 1, status: "available" }),
        node({ id: "c3", lessonIndex: 2, status: "locked" }),
      ],
      completedNodeIds: ["c1"],
    });
    expect(focusNodeId(p)).toBe("c2");
  });

  it("falls back to the last node when everything is finished", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "complete" }),
        node({ id: "c2", lessonIndex: 1, status: "complete" }),
      ],
      completedNodeIds: ["c1", "c2"],
    });
    expect(focusNodeId(p)).toBe("c2");
  });

  it("returns null only for a pathway with no nodes", () => {
    expect(focusNodeId(pathway({ nodes: [] }))).toBeNull();
  });

  /* Regression: the focus logic used to repeat its own status filters and
     forgot `failed`, so a broken card got the "YOU ARE HERE" ring. It now
     delegates to nextNode. */
  it("never focuses a failed node when a healthy one follows", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "failed" }),
        node({ id: "c2", lessonIndex: 1, status: "available" }),
      ],
    });
    expect(focusNodeId(p)).toBe("c2");
  });

  it("does not focus a locked node when everything readable is done", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "complete" }),
        node({ id: "c2", lessonIndex: 1, status: "locked" }),
      ],
      completedNodeIds: ["c1"],
    });
    /* Nothing to walk, so it falls back to the tail rather than pointing at
       an unreachable node as if it were the learner's position. */
    expect(focusNodeId(p)).toBe("c2");
  });
});

/* ------------------------------------------------------------------ */
/* Card counters                                                       */
/* ------------------------------------------------------------------ */

describe("card counters", () => {
  it("counts only cards, not checkpoints", () => {
    expect(totalCardCount(fourNodePathway())).toBe(2);
  });

  it("does not count a generating card as ready", () => {
    expect(readyCardCount(fourNodePathway())).toBe(1);
  });
});

describe("firstOpenCard", () => {
  it("returns an available card that carries content", () => {
    const p = pathway({ nodes: [node({ id: "c1", status: "available" })] });
    expect(firstOpenCard(p)?.id).toBe("c1");
  });

  it("ignores a card with no content even if it claims to be available", () => {
    /* This is the bug class the card page already guards with a notFound():
       an available node whose generation silently produced nothing. */
    const p = pathway({
      nodes: [node({ id: "c1", status: "available", card: undefined })],
    });
    expect(firstOpenCard(p)).toBeNull();
  });

  it("will not send a learner back into a card they already finished", () => {
    const p = pathway({
      nodes: [node({ id: "c1", status: "available" })],
      completedNodeIds: ["c1"],
    });
    expect(firstOpenCard(p)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* formatCountdown — the wait string the gate shows                    */
/* ------------------------------------------------------------------ */

describe("formatCountdown", () => {
  it("formats hours and minutes together", () => {
    expect(formatWait(19 * 3600_000 + 42 * 60_000)).toBe("19h 42m");
  });

  it("drops a zero minute instead of writing 19h 0m", () => {
    expect(formatWait(19 * 3600_000)).toBe("19h");
  });

  it("uses minutes under an hour", () => {
    expect(formatWait(42 * 60_000)).toBe("42m");
  });

  it("uses seconds under a minute and never rounds down to 0s", () => {
    expect(formatWait(30_000)).toBe("30s");
    /* A sub-second remainder must still read as pending, not as "0s done". */
    expect(formatWait(10)).toBe("1s");
    expect(formatWait(-5000)).toBe("1s");
  });
});

/* ------------------------------------------------------------------ */
/* quotaGate — N per rolling window, counted from start rows            */
/* ------------------------------------------------------------------ */

describe("quotaGate", () => {
  const NOW = Date.parse("2026-03-10T12:00:00.000Z");
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  it("unlocks a guest who has never generated", () => {
    const gate = quotaGate(undefined, NOW, TEST_LIMIT);
    expect(gate.locked).toBe(false);
    expect(gate.used).toBe(0);
    expect(gate.remaining).toBe(TEST_LIMIT);
    expect(gate.retryAt).toBeNull();
    expect(gate.wait).toBeNull();
  });

  it("ignores garbage timestamps rather than locking the user out", () => {
    const gate = quotaGate(["not-a-date", ""], NOW);
    expect(gate.locked).toBe(false);
    expect(gate.used).toBe(0);
  });

  it("stays unlocked below the limit and counts what it used", () => {
    for (let count = 1; count < TEST_LIMIT; count += 1) {
      const starts = Array.from({ length: count }, (_, i) => ago((i + 1) * 60_000));
      const gate = quotaGate(starts, NOW, TEST_LIMIT);
      expect(gate.locked).toBe(false);
      expect(gate.used).toBe(count);
      expect(gate.remaining).toBe(TEST_LIMIT - count);
      expect(gate.retryAt).toBeNull();
    }
  });

  it("locks exactly at the limit and reports when the oldest slot frees", () => {
    const starts = Array.from({ length: TEST_LIMIT }, (_, i) =>
      ago((i + 1) * 60_000),
    );
    const gate = quotaGate(starts, NOW, TEST_LIMIT);
    expect(gate.locked).toBe(true);
    expect(gate.used).toBe(TEST_LIMIT);
    expect(gate.remaining).toBe(0);
    /* The oldest of the three is the first to age out. */
    const oldest = NOW - TEST_LIMIT * 60_000;
    expect(gate.retryAt).toBe(new Date(oldest + QUOTA_WINDOW_MS).toISOString());
    expect(gate.wait).toBe("23h 57m");
  });

  it("frees a slot as soon as the oldest start leaves the window", () => {
    /* Three starts, the oldest one exactly one millisecond past the window.
       A quota of 3 means the two remaining are not enough to lock. */
    const starts = [
      ago(QUOTA_WINDOW_MS + 1),
      ago(60_000),
      ago(120_000),
    ];
    const gate = quotaGate(starts, NOW, TEST_LIMIT);
    expect(gate.used).toBe(2);
    expect(gate.locked).toBe(false);
    expect(gate.remaining).toBe(1);
  });

  it("still locks at the boundary, one millisecond inside the window", () => {
    const starts = Array.from({ length: TEST_LIMIT }, () =>
      ago(QUOTA_WINDOW_MS - 1),
    );
    expect(quotaGate(starts, NOW, TEST_LIMIT).locked).toBe(true);
  });

  it("counts only what is inside the window, however many rows exist", () => {
    const starts = [
      ago(QUOTA_WINDOW_MS * 3),
      ago(QUOTA_WINDOW_MS * 2),
      ago(QUOTA_WINDOW_MS + 5000),
    ];
    const gate = quotaGate(starts, NOW, TEST_LIMIT);
    expect(gate.used).toBe(0);
    expect(gate.remaining).toBe(TEST_LIMIT);
  });
});

describe("describeQuota", () => {
  const NOW = Date.parse("2026-03-10T12:00:00.000Z");

  it("counts down when the window is spent", () => {
    const gate = quotaGate(
      Array.from({ length: TEST_LIMIT }, () => new Date(NOW - 3600_000).toISOString()),
      NOW,
      TEST_LIMIT,
    );
    const text = describeQuota(gate);
    expect(text).toContain("next one in 23h");
    expect(text).toMatch(/for today/);
  });

  it("says complete when the window is not spent", () => {
    const gate = quotaGate(
      Array.from({ length: TEST_LIMIT - 1 }, () => new Date(NOW - 3600_000).toISOString()),
      NOW,
      TEST_LIMIT,
    );
    expect(describeQuota(gate)).toBe("Pathway complete.");
  });

  it("never says one pathway per day, which is no longer the rule", () => {
    const gate = quotaGate([], NOW);
    expect(describeQuota(gate)).not.toMatch(/tomorrow|per day/i);
  });
});

/* ------------------------------------------------------------------ */
/* bannerState — which single banner the map shows                     */
/* ------------------------------------------------------------------ */

describe("bannerState", () => {
  const NOW = Date.parse("2026-03-10T12:00:00.000Z");
  const openGate = quotaGate([], NOW);

  it("says we are writing the first card when nothing is readable yet", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "generating" }),
        node({ id: "c2", lessonIndex: 1, status: "locked" }),
      ],
    });
    const state = bannerState(p, openGate);
    expect(state.kind).toBe("generating-first");
    if (state.kind !== "generating-first") throw new Error("unreachable");
    expect(state.text).toContain("first card");
  });

  it("shows the day-done sentence once every node is finished", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "complete" }),
        quizNode({ id: "q1", status: "complete" }),
      ],
      completedNodeIds: ["c1", "q1"],
    });
    const state = bannerState(
      p,
      quotaGate(
        Array.from({ length: TEST_LIMIT }, (_, i) =>
          new Date(NOW - (i + 1) * 3600_000).toISOString(),
        ),
        NOW,
        TEST_LIMIT,
      ),
    );
    expect(state.kind).toBe("day-done");
    if (state.kind !== "day-done") throw new Error("unreachable");
    /* The oldest of the three (3h ago) is the slot that frees first: 24h - 3h. */
    expect(state.text).toContain("21h");
  });

  it("prefers day-done over filling so a finished path never claims to be busy", () => {
    /* Contrived but reachable: a regenerate marks a completed node as
       generating again. The learner is still done for the day. */
    const p = pathway({
      nodes: [node({ id: "c1", status: "generating" })],
      completedNodeIds: ["c1"],
    });
    expect(bannerState(p, openGate).kind).toBe("day-done");
  });

  it("renders nothing when everything is settled and unfinished", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "available" }),
        node({ id: "c2", lessonIndex: 1, status: "locked" }),
      ],
    });
    expect(bannerState(p, openGate).kind).toBe("none");
  });

  it("renders nothing for an empty pathway instead of an empty banner", () => {
    expect(bannerState(pathway({ nodes: [] }), openGate).kind).toBe("none");
  });
});
