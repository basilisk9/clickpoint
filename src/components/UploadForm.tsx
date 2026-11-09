"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { stageProgress, stageStates } from "@/lib/uploadStages";

export function UploadForm({
  lockedUntil = null,
  waitLabel = null,
}: {
  /* ISO timestamp of the next allowed build, from the server's daily gate.
     Non-null means this guest already built a pathway today. */
  lockedUntil?: string | null;
  /* "19h 42m" — pre-rendered on the server so the first paint is correct. */
  waitLabel?: string | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  /* The gate can lapse while this page sits open, so re-check it on a timer.
     The initial value comes from the prop during render, and the effect only
     ever *unlocks* — so there is no synchronous setState in the effect body. */
  const [locked, setLocked] = useState(Boolean(lockedUntil));

  useEffect(() => {
    if (!lockedUntil) return;
    const until = Date.parse(lockedUntil);
    if (Number.isNaN(until)) return;
    /* Already lapsed before we mounted: nothing to schedule. */
    if (Date.now() >= until) return;

    const timer = window.setInterval(() => {
      if (Date.now() >= until) {
        setLocked(false);
        window.clearInterval(timer);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  /* A frozen button for 30-60s reads as broken. Tick an elapsed clock while
     the request is in flight so the stage checklist can advance. */
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    /* Server already told us this guest is inside the 24h window. Stop here
       rather than spending a round trip on a guaranteed 429. */
    if (locked) {
      setError("You already built today's pathway.");
      return;
    }

    /* Client-side guard mirrors the API's own validation. Sending an empty
       form costs a round trip and a 24h rate-limit stamp, which is the worst
       possible outcome: the user loses today's pathway to a typo. */
    if (!notes.trim() && !fileName) {
      setError("Paste your notes or pick a file first.");
      return;
    }

    setBusy(true);
    setElapsed(0);
    startedAt.current = Date.now();
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/pathways", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not build the path.");

      /* Land on the first card, not the map. The promise is "you wait only
         for the first lesson", so the first lesson is what they should get.
         The map is progress, not the entry point. */
      const pathway = data.pathway;
      const firstCard = (pathway.nodes ?? []).find(
        (item: { kind: string; id: string; card?: unknown; html?: string }) =>
          item.kind === "card" && (item.card || item.html),
      );
      router.push(firstCard ? `/path/${pathway.id}/card/${firstCard.id}` : `/path/${pathway.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the path.");
      setBusy(false);
    }
  }

  const states = stageStates(elapsed);
  const progress = stageProgress(elapsed);

  /* One pathway per day is a product rule, not an error. Showing the locked
     state up front reads as "come back tomorrow"; showing the form and then a
     429 reads as a bug. */
  if (locked) {
    return (
      <div className="rounded-[28px] border border-[#d5e0db] bg-white/90 p-6 shadow-[0_20px_60px_rgba(16,35,31,0.08)]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f766e]">
          next pathway
        </p>
        <h2 className="mt-3 text-3xl font-semibold leading-tight">
          Today&apos;s pathway is built.
        </h2>
        {waitLabel ? (
          <p className="mt-4 text-[16px] leading-7 text-[#5d726c]">
            The next one opens in{" "}
            <span className="font-bold text-[#10231f]">{waitLabel}</span>.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/library" className="btn btn-primary">
            Open your library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[28px] border border-[#d5e0db] bg-white/90 p-6 shadow-[0_20px_60px_rgba(16,35,31,0.08)]"
    >
      <label className="block text-sm font-semibold uppercase tracking-wide text-[#5d726c]">
        Paste notes
      </label>
      <textarea
        name="notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        disabled={busy}
        placeholder="Dump the unit. Formulas, FRQs, messy bullets — all of it."
        className="mt-3 min-h-44 w-full resize-y rounded-2xl border border-[#d5e0db] bg-[#f7faf8] p-4 outline-none focus:border-[#0f766e] disabled:opacity-60"
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="chip cursor-pointer">
          <input
            type="file"
            name="file"
            accept=".pdf,.pptx,.txt,.md"
            className="hidden"
            disabled={busy}
            onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
          />
          {fileName || "Upload PDF / PPTX / TXT"}
        </label>
        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary"
        >
          {busy ? "Building your path…" : "Make the pathway"}
        </button>
      </div>

      {busy ? (
        <div className="mt-5 rounded-2xl border border-[#d5e0db] bg-[#f7faf8] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#10231f]">
              {states.find((item) => item.state === "active")?.stage.label}
              <span className="text-[#5d726c]">…</span>
            </p>
            <p className="font-mono text-xs text-[#5d726c]">
              {Math.floor(elapsed / 1000)}s
            </p>
          </div>
          {/* Width is an estimate, so the bar is capped at 95%: a full bar
              before the response lands would be a lie the first slow run
              exposes. */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#d5e0db]">
            <div
              className="h-full rounded-full bg-[#0f766e] transition-[width] duration-300 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <ol className="mt-4 space-y-1.5">
            {states.map(({ stage, state }) => (
              <li key={stage.id} className="flex items-center gap-2 text-sm">
                <span
                  className={
                    state === "done"
                      ? "text-[#0f766e]"
                      : state === "active"
                        ? "text-[#0f766e]"
                        : "text-[#b6c4bf]"
                  }
                >
                  {state === "done" ? "✓" : state === "active" ? "●" : "○"}
                </span>
                <span
                  className={
                    state === "pending" ? "text-[#b6c4bf]" : "text-[#10231f]"
                  }
                >
                  {stage.label}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm leading-6 text-[#5d726c]">
            Usually under a minute.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

