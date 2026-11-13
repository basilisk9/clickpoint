import { PATHWAYS_PER_DAY } from "./constants";
import { formatWait, quotaFrom } from "./ratelimit";
import type { PathwayNode, PathwayRecord } from "./types";

/* ------------------------------------------------------------------ */
/* Derived progress.                                                   */
/*                                                                     */
/* A pathway is a node list; the learner reads a status line instead.  */
/* This module is that translation, kept pure so the wording is        */
/* unit-testable without a browser or a database.                      */
/* ------------------------------------------------------------------ */

export type ProgressSummary = {
  /* Nodes the learner has finished. */
  completed: number;
  /* Total nodes, card and checkpoint alike. */
  total: number;
  /* Nodes the model is writing right now. */
  generating: number;
  /* Nodes still behind a lock. */
  locked: number;
  /* Nodes that finished generating but are not done yet — i.e. walkable. */
  ready: number;
  /* Generation is still in flight somewhere. */
  filling: boolean;
  /* Nothing left to generate AND the learner has finished everything. */
  finished: boolean;
};

export function summarizeProgress(pathway: PathwayRecord): ProgressSummary {
  const nodes = pathway.nodes ?? [];
  const total = nodes.length;
  const generating = nodes.filter((node) => node.status === "generating").length;
  const locked = nodes.filter((node) => node.status === "locked").length;

  /* Count completion by looking at the nodes themselves, not at the length of
     completedNodeIds. The two can disagree — a regenerate flips a completed
     node back to "generating", and a stale id can outlive its node — and
     subtracting independent tallies from `total` then yields a negative
     "ready", which would render as "-2 of 4 ready" at the learner. */
  const isDone = (node: PathwayNode) => pathway.completedNodeIds.includes(node.id);
  const readable = (node: PathwayNode) =>
    node.status !== "locked" && node.status !== "generating" && node.status !== "failed";

  const completed = nodes.filter(isDone).length;
  /* "Ready" means walkable and not yet finished. Derived node by node, so it
     can never exceed the total or dip below zero. */
  const ready = nodes.filter((node) => readable(node) && !isDone(node)).length;

  return {
    completed,
    total,
    generating,
    locked,
    ready,
    filling: generating > 0,
    /* An empty pathway is not "finished" — it has not started. */
    finished: total > 0 && completed >= total,
  };
}


/* "4 of 8 ready · 4 writing" — the sentence the background fill needs.
   Returns null when there is nothing useful to say, so callers can skip the
   element entirely instead of rendering an empty pill.

   `ready` is derived from the status buckets rather than by subtracting
   `generating` from `total`. The naive subtraction counted locked nodes as
   ready: at the very start of a pathway, card 1 is generating and every other
   node is locked, so it printed "3 of 4 ready" while the learner could open
   exactly one. */
export function describeBackgroundFill(progress: ProgressSummary): string | null {
  if (progress.total === 0) return null;
  if (progress.generating === 0) return null;

  const writing = progress.generating === 1 ? "1 still writing" : `${progress.generating} still writing`;
  const open = progress.ready + progress.completed;
  return `${open} of ${progress.total} ready · ${writing}`;
}

/* Which node the learner should open next. Walks in pathway order and takes
   the first node that is neither complete nor locked nor mid-generation. */
export function nextNode(pathway: PathwayRecord): PathwayNode | null {
  const nodes = pathway.nodes ?? [];
  return (
    nodes.find(
      (node) =>
        !pathway.completedNodeIds.includes(node.id) &&
        node.status !== "locked" &&
        node.status !== "generating" &&
        node.status !== "failed",
    ) ?? null
  );
}

/* The node the map should centre on when the page opens: whatever the learner
   was last doing, else the next one to do, else the final node. Never null
   while the pathway has any node, so "you are here" always points somewhere.

   Reuses `nextNode` rather than repeating its filters — duplicating the list
   of exclusions is how `failed` nodes previously slipped through as a
   suggested next step. */
export function focusNodeId(pathway: PathwayRecord): string | null {
  const nodes = pathway.nodes ?? [];
  if (nodes.length === 0) return null;

  const next = nextNode(pathway);
  if (next) return next.id;

  return nodes[nodes.length - 1]?.id ?? null;
}

/* A lesson is one card plus its checkpoint, so the "still writing" count
   should count cards: that is what the learner sees being written. */
export function cardNodes(pathway: PathwayRecord): PathwayNode[] {
  return (pathway.nodes ?? []).filter((node) => node.kind === "card");
}

export function readyCardCount(pathway: PathwayRecord): number {
  return cardNodes(pathway).filter(
    (node) => node.status !== "generating" && node.status !== "failed",
  ).length;
}

export function totalCardCount(pathway: PathwayRecord): number {
  return cardNodes(pathway).length;
}

/* The first card a learner is allowed to read right now. Used to decide
   whether the UI may pull them into a card they just unlocked. */
export function firstOpenCard(pathway: PathwayRecord): PathwayNode | null {
  return (
    (pathway.nodes ?? []).find(
      (node) =>
        node.kind === "card" &&
        node.status === "available" &&
        !pathway.completedNodeIds.includes(node.id) &&
        (node.card || node.html),
    ) ?? null
  );
}

/* ------------------------------------------------------------------ */
/* The pathway quota, as the UI sees it.                               */
/*                                                                     */
/* The rule itself lives in ratelimit.ts — pure, no database, no        */
/* Next import — so this is a read of the SAME counting code the API    */
/* enforces, not a second implementation of it. Previously the two      */
/* were separate implementations pinned together by a test; now there   */
/* is one rule and the test only has to check the wiring.               */
/* ------------------------------------------------------------------ */

export type QuotaGate = {
  locked: boolean;
  /* Pathways already built inside the rolling window. */
  used: number;
  /* Slots left in the window. */
  remaining: number;
  /* ISO timestamp of the next freed slot, or null when unlocked. */
  retryAt: string | null;
  /* "19h 42m", or null when unlocked. */
  wait: string | null;
};

export function quotaGate(
  starts: readonly string[] | null | undefined,
  now: number = Date.now(),
): QuotaGate {
  const state = quotaFrom(starts, now);
  const locked = state.remaining === 0;
  return {
    locked,
    used: state.used,
    remaining: state.remaining,
    retryAt: locked ? state.nextAt : null,
    wait: locked && state.nextAt ? formatWait(Date.parse(state.nextAt) - now) : null,
  };
}

/* The wording a finished pathway shows. It never reads "one pathway per day",
   because that is no longer the rule: three may be built, in any order, and
   the sentence has to say which of them this was. */
export function describeQuota(gate: QuotaGate): string {
  if (gate.locked && gate.wait) {
    return `Pathway complete. That's all ${PATHWAYS_PER_DAY} for today — next one in ${gate.wait}.`;
  }
  const left = gate.remaining === 1 ? "1 more pathway" : `${gate.remaining} more pathways`;
  return `Pathway complete. ${left} today.`;
}

/* Which single banner the pathway map shows, if any. Ordering matters: a
   finished pathway beats a filling one, because once everything is done the
   "still writing" counter would misdescribe the real state the learner is in. */
export type PathwayBannerState =
  | { kind: "day-done"; text: string }
  | { kind: "filling"; text: string }
  | { kind: "generating-first"; text: string }
  | { kind: "none" };

export function bannerState(
  pathway: PathwayRecord,
  gate: QuotaGate,
): PathwayBannerState {
  const progress = summarizeProgress(pathway);

  if (progress.finished) {
    return { kind: "day-done", text: describeQuota(gate) };
  }

  /* Nothing readable yet: still waiting on card 1. This is the one wait the
     landing page promised, so say so plainly instead of showing a spinner. */
  if (progress.total > 0 && progress.ready + progress.completed === 0) {
    return {
      kind: "generating-first",
      text: "Writing your first card. This takes a moment.",
    };
  }

  const fill = describeBackgroundFill(progress);
  if (fill) return { kind: "filling", text: fill };

  return { kind: "none" };
}
