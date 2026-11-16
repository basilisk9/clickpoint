"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PathwayNode, PathwayRecord } from "@/lib/types";
import { CardRenderer } from "./CardRenderer";

export function CardFrame({
  pathway,
  node,
}: {
  pathway: PathwayRecord;
  node: PathwayNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const lesson = pathway.outline.lessons[node.lessonIndex];
  const compression = lesson?.compression;

  async function finish() {
    setBusy(true);
    const response = await fetch(`/api/pathways/${pathway.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: node.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setBusy(false);
      alert(data.error || "Could not finish lesson.");
      return;
    }
    const quiz = data.pathway.nodes.find(
      (item: PathwayNode) => item.kind === "quiz" && item.lessonIndex === node.lessonIndex,
    );
    router.push(quiz ? `/path/${pathway.id}/quiz/${quiz.id}` : `/path/${pathway.id}`);
  }

  return (
    <div className="min-h-screen bg-[#eef3f1]">
      <div className="shell py-6">
        <a href={`/path/${pathway.id}`} className="text-sm font-semibold text-[#5d726c] no-underline">
          ← Pathway
        </a>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#0f766e]">
          CARD {String(node.lessonIndex + 1).padStart(2, "0")} · {pathway.banner.title}
        </p>
        <div className="mt-3 flex items-start justify-between gap-6">
          <h1 className="max-w-4xl text-6xl font-semibold leading-[0.92] tracking-tight">
            {node.card?.title || node.title}
          </h1>
          <div className="flex flex-col items-end gap-2">
            {compression ? (
              <span className="chip">
                the click · {compression.from} → {compression.to}
              </span>
            ) : null}
            <span className="chip">{pathway.outline.sourceTag}</span>
          </div>
        </div>
      </div>

      <div className="shell">
        {node.card ? (
          /* Typed content rendered by the shared design system. No iframe,
             no injected CSS, no sandbox — the card cannot carry its own
             styling, so every card is consistent by construction. */
          <CardRenderer spec={node.card} />
        ) : node.html ? (
          /* Legacy card from before the typed-content migration. Still
             rendered in a sandboxed frame so old records keep working. */
          <iframe
            title={node.title}
            srcDoc={node.html}
            sandbox="allow-scripts allow-same-origin"
            className="block min-h-[70vh] w-full rounded-[24px] border border-[#d5e0db] bg-white"
          />
        ) : (
          <p className="rounded-[24px] border border-[#d5e0db] bg-white px-6 py-10 text-center text-sm text-[#5d726c]">
            This card has no content yet.
          </p>
        )}
      </div>

      <div className="shell flex flex-wrap items-center justify-between gap-4 py-8">
        <button
          onClick={finish}
          disabled={busy}
          className="btn btn-primary"
        >
          {busy ? "Saving…" : "Finish lesson"}
        </button>
      </div>
    </div>
  );
}

