"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  FEEDBACK_MAX,
  FEEDBACK_MIN,
  FEEDBACK_TARGETS,
  type FeedbackTarget,
  type FeedbackTargetId,
} from "@/lib/feedbackTargets";

/* ------------------------------------------------------------------ */
/* Feedback, anchored to what it is about.                             */
/*                                                                     */
/* One floating widget, bottom-right, mounted in the root layout so    */
/* every screen has it. The catalogue narrows by route: a card page    */
/* asks about the card, a checkpoint asks about the answer key, and   */
/* everything else falls back to the general list. The ids are read   */
/* from the URL, so the report arrives carrying what a human needs to  */
/* check it against what the model actually wrote.                    */
/*                                                                     */
/* The stamp is minted once per form fill and reused by every retry,   */
/* so a send whose response was lost cannot leave two rows behind.     */
/* "Send another" mints a fresh stamp: a new report, a new row.        */
/* ------------------------------------------------------------------ */

/* Pathway and node ids are pulled out of the pathname, not passed in:
   the widget is global, so its props cannot depend on the page. */
function idsFromPathname(pathname: string): {
  pathwayId?: string;
  nodeId?: string;
} {
  /* /path/<id>/card/<nodeId> and /path/<id>/quiz/<nodeId> */
  const focused = pathname.match(/^\/path\/([^/]+)\/(card|quiz)\/([^/]+)/);
  if (focused) {
    return { pathwayId: focused[1], nodeId: focused[3] };
  }
  /* /path/<id> */
  const map = pathname.match(/^\/path\/([^/]+)$/);
  if (map) return { pathwayId: map[1] };
  return {};
}

function catalogueFor(pathname: string): FeedbackTarget[] {
  if (/^\/path\/[^/]+\/card\//.test(pathname)) {
    return FEEDBACK_TARGETS.filter((t) => t.id === "card-wrong" || t.id === "card-unclear");
  }
  if (/^\/path\/[^/]+\/quiz\//.test(pathname)) {
    return FEEDBACK_TARGETS.filter((t) => t.id === "quiz-answer" || t.id === "bug");
  }
  return FEEDBACK_TARGETS.filter(
    (t) => t.id === "bug" || t.id === "idea" || t.id === "general",
  );
}

export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<FeedbackTargetId>("bug");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  /* Minted per form fill, so a retry after a failed send is the same report. */
  const [stamp, setStamp] = useState(() => Date.now());

  const catalogue = catalogueFor(pathname);
  const { pathwayId, nodeId } = idsFromPathname(pathname);
  const target =
    catalogue.find((item) => item.id === targetId) ?? catalogue[0];

  /* A route change can invalidate the selected target (e.g. card → quiz);
     fall back to the route's first option so the select never shows a
     phantom choice. */
  useEffect(() => {
    if (!catalogue.some((item) => item.id === targetId)) {
      setTargetId(catalogue[0]?.id ?? "bug");
    }
  }, [catalogue, targetId]);

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
          pageUrl: pathname,
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

  /* A fresh form fill: new stamp, blank body, catalogue re-derived by route.
     Keeps the panel open for the next report without a round trip. */
  function reset() {
    setStamp(Date.now());
    setBody("");
    setError("");
    setStatus("idle");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-[#0f766e] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(15,118,110,0.35)] transition hover:brightness-110"
      >
        Send feedback
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-sm rounded-2xl border border-[#d5e0db] bg-white p-4 text-left shadow-[0_16px_48px_rgba(16,35,31,0.18)]">
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
          value={target?.id ?? ""}
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

      {status === "done" ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#0f766e]">
            Sent. Thank you.
          </p>
          <button
            type="button"
            onClick={reset}
            className="text-sm font-semibold text-[#0f766e] underline decoration-dotted underline-offset-4 hover:text-[#10231f]"
          >
            Send another
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
