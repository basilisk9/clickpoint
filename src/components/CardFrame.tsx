"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PathwayNode, PathwayRecord } from "@/lib/types";
import { CARD_READ_XP, FINISH_LESSON_XP } from "@/lib/constants";
import { CardRenderer } from "./CardRenderer";

/* The card's reward layer.

   Reading a card is the lesson, so it is worth XP on the spot rather than
   only after the checkpoint. The bar fills as sections scroll past and the
   star counts up, so a long card feels like progress the learner is making
   instead of a page they are being made to read. */
function RewardBar({
  seen,
  total,
  xp,
  reading,
}: {
  seen: number;
  total: number;
  xp: number;
  reading: boolean;
}) {
  const pct = total > 0 ? Math.round((seen / total) * 100) : 0;
  const complete = total > 0 && seen >= total;
  return (
    <div className="sticky top-0 z-20 border-b border-[#d5e0db] bg-[#eef3f1]/95 backdrop-blur">
      <div className="shell flex items-center gap-4 py-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#d5e0db]">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%`, background: "var(--color-pine)" }}
          />
        </div>
        <span className="font-mono text-[12px] font-bold tabular-nums text-[#5d726c]">
          {seen}/{total}
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-[#e5c47a] bg-[#fdf0d8] px-3 py-1 font-mono text-[13px] font-bold tabular-nums text-[#8a5a00]">
          <span aria-hidden className={complete ? "pop-in" : ""}>
            ★
          </span>
          {xp} XP
        </span>
        {complete ? (
          <span className="pop-in hidden text-[12px] font-bold text-[#0f766e] sm:inline">
            {reading ? "card read — finish it" : "ready for the checkpoint"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CardFrame({
  pathway,
  node,
}: {
  pathway: PathwayRecord;
  node: PathwayNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(0);
  const [total, setTotal] = useState(0);
  const [awarded, setAwarded] = useState(false);
  const lesson = pathway.outline.lessons[node.lessonIndex];
  const compression = lesson?.compression;

  /* The reward is reading, so the counter follows the bar rather than the
     button: a learner who scrolled the whole card has earned it. Awarded
     once, the first time the last section is reached. */
  function handleProgress(next: number, all: number) {
    setSeen(next);
    setTotal(all);
    if (all > 0 && next >= all) setAwarded(true);
  }

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
      <RewardBar
        seen={seen}
        total={total}
        xp={(awarded ? CARD_READ_XP : 0) + FINISH_LESSON_XP}
        reading={!busy}
      />
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
          <CardRenderer spec={node.card} onProgress={handleProgress} />
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
          {busy ? "Saving…" : `Finish lesson · +${FINISH_LESSON_XP} XP`}
        </button>
        <p className="text-sm font-semibold text-[#5d726c]">
          {awarded
            ? `★ +${CARD_READ_XP} XP earned for reading this card.`
            : "Read to the end to earn the card's XP."}
        </p>
      </div>
    </div>
  );
}

