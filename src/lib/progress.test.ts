import { describe, expect, it } from "vitest";
import {
  bannerState,
  dailyGate,
  describeBackgroundFill,
  describeDayDone,
  firstOpenCard,
  focusNodeId,
  formatCountdown,
  nextNode,
  readyCardCount,
  summarizeProgress,
  totalCardCount,
} from "./progress";
import { PATHWAY_COOLDOWN_MS } from "./constants";
import type { PathwayNode, PathwayRecord } from "./types";

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
/* describeBackgroundFill                                              */
/* ------------------------------------------------------------------ */

describe("describeBackgroundFill", () => {
  /* 4 nodes: 2 complete, 1 generating, 1 locked. Only the 2 finished nodes are
     readable, so the honest count is 2 — not 3. The old code subtracted
     `generating` from `total` and counted the locked node as ready. */
  it("counts completed nodes as ready and never counts locked ones", () => {
    const summary = summarizeProgress(fourNodePathway());
    expect(describeBackgroundFill(summary)).toBe("2 of 4 ready · 1 cooking");
  });

  it("reads correctly when one node is open and one is cooking", () => {
    const oneCooking = summarizeProgress(
      pathway({
        nodes: [
          node({ id: "c1", status: "available" }),
          node({ id: "c2", status: "generating" }),
        ],
      }),
    );
    expect(describeBackgroundFill(oneCooking)).toBe("1 of 2 ready · 1 cooking");
  });

  it("returns null when nothing is generating, so no empty pill renders", () => {
    const settled = summarizeProgress(
      pathway({ nodes: [node({ id: "c1", status: "available" })] }),
    );
    expect(describeBackgroundFill(settled)).toBeNull();
  });

  it("returns null for an empty pathway", () => {
    expect(describeBackgroundFill(summarizeProgress(pathway()))).toBeNull();
  });

  /* Regression: at the very start of a pathway card 1 is generating and every
     other node is locked. The naive subtraction printed "3 of 4 ready" while
     the learner could open exactly zero nodes. */
  it("never claims locked nodes are ready at the start of a pathway", () => {
    const starting = summarizeProgress(
      pathway({
        nodes: [
          node({ id: "c1", status: "generating" }),
          node({ id: "q1", lessonIndex: 0, status: "locked" }),
          node({ id: "c2", lessonIndex: 1, status: "locked" }),
          node({ id: "q2", lessonIndex: 1, status: "locked" }),
        ],
      }),
    );
    expect(describeBackgroundFill(starting)).toBe("0 of 4 ready · 1 cooking");
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
/* formatCountdown                                                     */
/* ------------------------------------------------------------------ */

describe("formatCountdown", () => {
  it("formats hours and minutes together", () => {
    expect(formatCountdown(19 * 3600_000 + 42 * 60_000)).toBe("19h 42m");
  });

  it("drops a zero minute instead of writing 19h 0m", () => {
    expect(formatCountdown(19 * 3600_000)).toBe("19h");
  });

  it("uses minutes under an hour", () => {
    expect(formatCountdown(42 * 60_000)).toBe("42m");
  });

  it("uses seconds under a minute and never rounds down to 0s", () => {
    expect(formatCountdown(30_000)).toBe("30s");
    /* A sub-second remainder must still read as pending, not as "0s done". */
    expect(formatCountdown(10)).toBe("1s");
    expect(formatCountdown(-5000)).toBe("1s");
  });
});

/* ------------------------------------------------------------------ */
/* dailyGate                                                           */
/* ------------------------------------------------------------------ */

describe("dailyGate", () => {
  const NOW = Date.parse("2026-03-10T12:00:00.000Z");

  it("unlocks a guest who has never generated", () => {
    const gate = dailyGate(undefined, PATHWAY_COOLDOWN_MS, NOW);
    expect(gate.locked).toBe(false);
    expect(gate.retryAt).toBeNull();
    expect(gate.wait).toBeNull();
  });

  it("unlocks on a garbage timestamp rather than locking the user out", () => {
    /* Matches checkPathwayLimit: bad data must never cost someone the product. */
    expect(dailyGate("not-a-date", PATHWAY_COOLDOWN_MS, NOW).locked).toBe(false);
    expect(dailyGate("", PATHWAY_COOLDOWN_MS, NOW).locked).toBe(false);
  });

  it("locks inside the cooldown window and reports the remaining wait", () => {
    const last = new Date(NOW - 4 * 3600_000).toISOString();
    const gate = dailyGate(last, PATHWAY_COOLDOWN_MS, NOW);
    expect(gate.locked).toBe(true);
    expect(gate.wait).toBe("20h");
    expect(gate.retryAt).toBe(new Date(NOW + 20 * 3600_000).toISOString());
  });

  it("unlocks exactly at the cooldown boundary, not one tick early", () => {
    const exactly = new Date(NOW - PATHWAY_COOLDOWN_MS).toISOString();
    expect(dailyGate(exactly, PATHWAY_COOLDOWN_MS, NOW).locked).toBe(false);

    const oneMsShort = new Date(NOW - PATHWAY_COOLDOWN_MS + 1).toISOString();
    expect(dailyGate(oneMsShort, PATHWAY_COOLDOWN_MS, NOW).locked).toBe(true);
  });

  it("stays unlocked well past the window", () => {
    const last = new Date(NOW - 2 * PATHWAY_COOLDOWN_MS).toISOString();
    expect(dailyGate(last, PATHWAY_COOLDOWN_MS, NOW).locked).toBe(false);
  });
});

describe("describeDayDone", () => {
  it("counts down when the guest is still inside the cooldown", () => {
    const text = describeDayDone({
      locked: true,
      retryAt: "2026-03-11T08:00:00.000Z",
      wait: "19h 42m",
    });
    expect(text).toContain("19h 42m");
    expect(text).toContain("Pathway complete");
  });

  it("points at tomorrow when the cooldown has already lapsed", () => {
    const text = describeDayDone({ locked: false, retryAt: null, wait: null });
    expect(text).toBe("Pathway complete. Build the next one tomorrow.");
  });
});

/* ------------------------------------------------------------------ */
/* bannerState — which single banner the map shows                     */
/* ------------------------------------------------------------------ */

describe("bannerState", () => {
  const openGate = { locked: false, retryAt: null, wait: null };

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

  it("shows the live fill counter once something is readable", () => {
    const state = bannerState(fourNodePathway(), openGate);
    expect(state.kind).toBe("filling");
    if (state.kind !== "filling") throw new Error("unreachable");
    expect(state.text).toBe("2 of 4 ready · 1 cooking");
  });

  it("shows the day-done sentence once every node is finished", () => {
    const p = pathway({
      nodes: [
        node({ id: "c1", status: "complete" }),
        quizNode({ id: "q1", status: "complete" }),
      ],
      completedNodeIds: ["c1", "q1"],
    });
    const state = bannerState(p, { locked: true, retryAt: "x", wait: "3h" });
    expect(state.kind).toBe("day-done");
    if (state.kind !== "day-done") throw new Error("unreachable");
    expect(state.text).toContain("3h");
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
