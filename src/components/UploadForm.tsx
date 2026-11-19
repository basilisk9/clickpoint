"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { MAX_UPLOAD_FILES } from "@/lib/constants";
import { stageProgress, stageStates } from "@/lib/uploadStages";

/* ------------------------------------------------------------------ */
/* The generator form.                                                 */
/*                                                                     */
/* This is the slow interaction — a pathway takes 30-100s — so it lives */
/* on its own page. The landing page used to carry it, which meant a    */
/* stranger met a progress bar before finding out what the product is.  */
/* ------------------------------------------------------------------ */

/* "19h 42m", "6m" — matches formatWait in ratelimit.ts, duplicated because
   that module must not cross into the client bundle for one string. */
function waitLabel(until: number, now: number): string {
  const totalSeconds = Math.max(1, Math.ceil((until - now) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function UploadForm({
  lockedUntil = null,
  used = 0,
}: {
  /* ISO timestamp of the next freed quota slot, from the server. Non-null means
     this guest has spent the whole rolling window. */
  lockedUntil?: string | null;
  /* Pathways already built inside the window, for the "2 of 3" line. */
  used?: number;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  /* Drives the locked-panel countdown only. The stage checklist runs off
     `elapsed`, which is a separate, faster clock. */
  const [now, setNow] = useState(() => Date.now());

  const until = lockedUntil ? Date.parse(lockedUntil) : NaN;
  const locked = Number.isFinite(until) && now < until;

  useEffect(() => {
    if (!busy && !lockedUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [busy, lockedUntil]);

  /* The stage checklist advances on a 250ms clock; the countdown above does not
     need that resolution. */
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 250);
    return () => window.clearInterval(timer);
  }, [busy, startedAt]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    /* Server already said this guest is out of quota. Stop here rather than
       spending a round trip on a guaranteed 429. */
    if (locked) {
      setError("You've used today's pathways.");
      return;
    }

    /* A client-side guard that mirrors the API. Sending an empty form costs a
       round trip, and a too-long one costs the user their notes being refused
       after the wait — checking both here is the cheapest place. */
    if (!notes.trim() && fileNames.length === 0) {
      setError("Paste your notes or pick a file first.");
      return;
    }

    setBusy(true);
    setElapsed(0);
    setStartedAt(Date.now());
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

  /* Out of quota is a product rule, not an error. Showing it up front reads as
     "come back later"; showing the form and then a 429 reads as a bug. */
  if (locked) {
    return (
      <div className="rounded-[28px] border border-[#d5e0db] bg-white/90 p-6 shadow-[0_20px_60px_rgba(16,35,31,0.08)]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f766e]">
          today&apos;s pathways
        </p>
        <h2 className="mt-3 text-3xl font-semibold leading-tight">That&apos;s the daily limit.</h2>
        <p className="mt-4 text-[16px] leading-7 text-[#5d726c]">
          The next slot opens in{" "}
          <span className="font-bold text-[#10231f]">{waitLabel(until, now)}</span>.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/library" className="btn btn-primary">
            Open your library
          </a>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[28px] border border-[#d5e0db] bg-white/90 p-6 shadow-[0_20px_60px_rgba(16,35,31,0.08)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-sm font-semibold uppercase tracking-wide text-[#5d726c]">
          Paste notes
        </label>
        <span className="chip">Free</span>
      </div>
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
            multiple
            accept=".pdf,.pptx,.txt,.md"
            className="hidden"
            disabled={busy}
            onChange={(event) =>
              setFileNames(
                Array.from(event.target.files ?? [])
                  .slice(0, MAX_UPLOAD_FILES)
                  .map((file) => file.name),
              )
            }
          />
          {fileNames.length === 0
            ? "Upload PDF / PPTX / TXT"
            : `${fileNames.length} file${fileNames.length === 1 ? "" : "s"}`}
        </label>
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Making pathway…" : "Make the pathway"}
        </button>
      </div>

      {/* One line per file, so it is obvious which ones are being read rather
          than only how many. */}
      {fileNames.length ? (
        <ul className="mt-3 space-y-1">
          {fileNames.map((name) => (
            <li key={name} className="truncate font-mono text-xs text-[#5d726c]">
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[#5d726c]">
          Up to {MAX_UPLOAD_FILES} files — a lecture PDF and a problem set together
          is the normal case.
        </p>
      )}

      {busy ? (
        <div className="mt-5 rounded-2xl border border-[#d5e0db] bg-[#f7faf8] p-4">
          <p className="text-sm font-bold text-[#10231f]">
            Making pathway<span className="text-[#5d726c]">…</span>
          </p>
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
                  className={state === "pending" ? "text-[#b6c4bf]" : "text-[#10231f]"}
                >
                  {stage.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
