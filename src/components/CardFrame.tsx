"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PathwayNode, PathwayRecord } from "@/lib/types";
import { CARD_READ_XP, FINISH_LESSON_XP } from "@/lib/constants";
import { CardIframe } from "./CardIframe";

/* The card's reward layer.
   Reading a card is the lesson, so it is worth XP on the spot rather than
   only after the checkpoint. The bar fills as the learner scrolls the page
   and the star lands when they reach the bottom, so a long card feels like
   progress the learner is making instead of a page they are being made to
   read. The card iframe is auto-height, so the page owns the only scroll
   position — one document, one scrollbar. */
function RewardBar({
  seen,
  xp,
  reading,
}: {
  seen: number;
  xp: number;
  reading: boolean;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-[#d5e0db] bg-[#eef3f1]/95 backdrop-blur">
      <div className="shell flex items-center gap-4 py-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#d5e0db]">
          <div
            className="h-full rounded-full bg-[#0f766e] transition-all duration-300"
            style={{ width: `${seen}%` }}
          />
        </div>
        <span className="text-sm font-bold text-[#0f766e]">★ {xp} XP</span>
        <span className={`text-sm font-medium text-[#5d726c] ${reading ? "" : "opacity-60"}`}>
          {reading ? "reading…" : "saving…"}
        </span>
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
  const [awarded, setAwarded] = useState(false);

  /* Scroll depth of the whole page. The iframe is sized to its content,
     so there is exactly one scrollable surface: the window. */
  useEffect(() => {
    function onScroll() {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const pct = Math.min(100, Math.round((window.scrollY / max) * 100));
      setSeen(pct);
      if (pct >= 98) setAwarded(true);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

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
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "#f2f5f3",
        backgroundImage:
          "linear-gradient(to right, rgba(19,42,50,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(19,42,50,0.055) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
      }}
    >
      <RewardBar
        seen={seen}
        xp={(awarded ? CARD_READ_XP : 0) + FINISH_LESSON_XP}
        reading={!busy}
      />
      {/* The card renders its own title, eyebrow, meta chips and movement
          bands inside the iframe — the host keeps only navigation around
          it, so nothing is printed twice. */}
      <div className="mx-auto w-full max-w-[1120px] px-6 py-4">
        <a href={`/path/${pathway.id}`} className="text-sm font-semibold text-[#5d726c] no-underline">
          ← Pathway
        </a>
      </div>

      <div className="shell">
        {node.card ? (
          /* The card IS the model's HTML, rendered verbatim in the sandboxed
             iframe with the host's fonts, KaTeX, and macro CSS injected ahead
             of the model's own styles. Auto-height: the card flows as one
             continuous document with the page. */
          <CardIframe html={node.card.html} title={node.card.title} />
        ) : (
          <p className="rounded-[24px] border border-[#d5e0db] bg-white px-6 py-10 text-center text-sm text-[#5d726c]">
            This card has no content yet.
          </p>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-8">
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
