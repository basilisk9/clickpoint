"use client";

import { useState } from "react";
import {
  FEEDBACK_MAX,
  FEEDBACK_MIN,
  FEEDBACK_TARGETS,
  type FeedbackTargetId,
} from "@/lib/feedbackTargets";

/* ------------------------------------------------------------------ */
/* Feedback, anchored to what it is about.                             */
/*                                                                     */
/* A card page asks about the card; a checkpoint asks about the answer  */
/* key. That is the feedback worth having, because the report arrives   */
/* carrying the ids needed to check it against what the model actually  */
/* wrote. The general box is the fallback, not the default — a floating */
/* bubble on every screen would be the clutter this app is trying to    */
/* get away from.                                                       */
/*                                                                     */
/* The stamp is minted once per open form and reused by every retry, so */
/* a send whose response was lost cannot leave two rows behind.         */
/* ------------------------------------------------------------------ */

export function FeedbackButton({
  label = "Send feedback",
  targets,
  pathwayId,
  nodeId,
}: {
  label?: string;
  /* Which questions this surface may ask. Narrower is better. */
  targets: FeedbackTargetId[];
  pathwayId?: string;
  nodeId?: string;
}) {
  const catalogue = FEEDBACK_TARGETS.filter((target) => targets.includes(target.id));
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<FeedbackTargetId>(catalogue[0]?.id ?? "general");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  /* Minted on open, so a retry after a failed send is the same report. */
  const [stamp] = useState(() => Date.now());

  const target = catalogue.find((item) => item.id === targetId) ?? catalogue[0];

  async function send() {
    setError("");
    const text = body.trim();
    if (text.length < FEEDBACK_MIN) {
      setError("Add a little more detail so it is actionable.");
      return;
    }
    setStatus("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: target?.kind ?? "general",
          body: text,
          pathwayId,
          nodeId,
          pageUrl: window.location.pathname,
          at: stamp,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not send that.");
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that.");
      setStatus("idle");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-[#5d726c] underline decoration-dotted underline-offset-4 hover:text-[#10231f]"
      >
        {label}
      </button>
    );
  }

  if (status === "done") {
    return (
      <p className="text-sm font-semibold text-[#0f766e]">
        Got it. Thanks — this goes straight to whoever can fix it.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-[#d5e0db] bg-white p-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-[#10231f]">
          {catalogue.length > 1 ? "What's wrong?" : target?.label}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-semibold text-[#5d726c] hover:text-[#10231f]"
        >
          Close
        </button>
      </div>

      {catalogue.length > 1 ? (
        <select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value as FeedbackTargetId)}
          className="mt-3 w-full rounded-xl border border-[#d5e0db] bg-[#f7faf8] px-3 py-2 text-sm outline-none focus:border-[#0f766e]"
        >
          {catalogue.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}

      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={FEEDBACK_MAX}
        placeholder={target?.prompt ?? "Tell us what happened."}
        className="mt-3 min-h-24 w-full resize-y rounded-xl border border-[#d5e0db] bg-[#f7faf8] p-3 text-sm outline-none focus:border-[#0f766e]"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void send()}
          disabled={status === "sending"}
          className="btn btn-primary btn-sm"
        >
          {status === "sending" ? "Sending…" : "Send"}
        </button>
        <span className="font-mono text-xs text-[#8299a1]">
          {body.trim().length}/{FEEDBACK_MAX}
        </span>
      </div>

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
