"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function UploadForm() {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/pathways", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not build the path.");
      router.push(`/path/${data.pathway.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the path.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-[28px] border border-[#d5e0db] bg-white/90 p-6 shadow-[0_20px_60px_rgba(16,35,31,0.08)]">
      <label className="block text-sm font-semibold tracking-wide text-[#5d726c] uppercase">
        Paste notes
      </label>
      <textarea
        name="notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Dump the unit. Formulas, FRQs, messy bullets — all of it."
        className="mt-3 min-h-44 w-full resize-y rounded-2xl border border-[#d5e0db] bg-[#f7faf8] p-4 outline-none focus:border-[#0f766e]"
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="chip cursor-pointer">
          <input
            type="file"
            name="file"
            accept=".pdf,.pptx,.txt,.md"
            className="hidden"
            onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
          />
          {fileName || "Upload PDF / PPTX / TXT"}
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-[#10231f] px-5 py-3 text-sm font-bold tracking-wide text-white disabled:opacity-60"
        >
          {busy ? "Building your path…" : "Make the pathway"}
        </button>
      </div>
      {busy ? (
        <p className="mt-4 text-sm text-[#5d726c]">
          Waiting on the syllabus, banner, and card 1. Later cards cook while you learn.
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
