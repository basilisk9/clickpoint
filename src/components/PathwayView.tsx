"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader, type HeaderAccount } from "@/components/SiteHeader";
import {
  bannerState,
  focusNodeId,
  quotaGate,
  summarizeProgress,
} from "@/lib/progress";
import type { PathwayNode, PathwayRecord } from "@/lib/types";

const columns = [18, 50, 82, 34, 66];

function nodeHref(pathwayId: string, node: PathwayNode) {
  if (node.status === "locked" || node.status === "generating") return null;
  if (node.kind === "card") return `/path/${pathwayId}/card/${node.id}`;
  return `/path/${pathwayId}/quiz/${node.id}`;
}

export function PathwayView({
  initial,
  starts = [],
  account = null,
}: {
  initial: PathwayRecord;
  /* Start timestamps for the quota window, passed from the server so the
     day-done copy can count down without another request. Empty leaves the
     gate open. */
  starts?: string[];
  /* Resolved server-side: this is a client component, so it cannot read the
     session cookie itself. */
  account?: HeaderAccount;
}) {
  const [pathway, setPathway] = useState(initial);
  /* One clock for the whole view, ticked locally, so the countdown re-renders
     without refetching. */
  const [now, setNow] = useState(() => Date.now());

  /* Poll while generation is in flight, then stop. The old version polled
     every 4s forever, which kept a serverless function warm for no reason
     once nothing was left to fill. */
  const stillFilling = pathway.nodes.some((node) => node.status === "generating");

  useEffect(() => {
    if (!stillFilling) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/pathways/${pathway.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setPathway(data.pathway);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [pathway.id, stillFilling]);

  /* Re-render the countdown twice a minute; that is the resolution the copy
     shows, so a faster tick would only burn renders. */
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const progress = summarizeProgress(pathway);
  const gate = quotaGate(starts, now);
  const banner = bannerState(pathway, gate);
  const focus = focusNodeId(pathway);
  const floaters = useMemo(() => pathway.banner.floating.slice(0, 4), [pathway.banner.floating]);

  return (
    <div>
      <SiteHeader
        completed={progress.completed}
        total={progress.total}
        xp={pathway.xp}
        account={account}
      />
      <main className="shell pb-24">
        <section className="relative overflow-hidden rounded-[32px] bg-[#10242c] px-10 py-10 text-white shadow-[0_24px_60px_rgba(16,36,44,0.28)]">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#f59e0b]">
            {pathway.banner.kicker}
          </p>
          <div className="mt-4 grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h1 className="max-w-xl text-6xl font-semibold leading-[0.92] tracking-tight">
                {pathway.banner.title}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#c5d0d4]">
                {pathway.banner.blurb}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {pathway.banner.stats.map((stat) => (
                  <span key={stat} className="rounded-full bg-white/8 px-3 py-2 text-sm text-[#d7e2e6]">
                    {stat}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative">
              <div
                className="rounded-3xl bg-[#0b1b22] p-4"
                dangerouslySetInnerHTML={{ __html: pathway.banner.bannerSvg }}
              />
              {pathway.banner.bannerCaption ? (
                <p className="mt-3 text-center text-sm text-[#9fb0b6]">{pathway.banner.bannerCaption}</p>
              ) : null}
            </div>
          </div>
          {floaters.map((chip, index) => (
            <span
              key={chip}
              className="absolute rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-[#10231f] shadow"
              style={{
                left: `${12 + index * 18}%`,
                bottom: index % 2 === 0 ? "18px" : "auto",
                top: index % 2 === 0 ? "auto" : "28px",
              }}
            >
              {chip}
            </span>
          ))}
        </section>

        {/* Background progress. Without this line the fact that later cards
            appear on their own is invisible. */}
        {banner.kind !== "none" ? (
          <div
            role="status"
            aria-live="polite"
            className={`mt-6 flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4 ${
              banner.kind === "day-done"
                ? "border-[#0f766e]/35 bg-[#e4efe9] text-[#0a5c51]"
                : "border-[#d5e0db] bg-white text-[#10231f]"
            }`}
          >
            {banner.kind !== "day-done" ? (
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[#0f766e] pulse-ring"
                aria-hidden
              />
            ) : (
              <span className="text-[#0f766e]" aria-hidden>
                ✓
              </span>
            )}
            <p className="text-sm font-semibold">{banner.text}</p>
            {banner.kind === "day-done" ? (
              <Link href="/" className="ml-auto text-sm font-bold text-[#0f766e] no-underline">
                Build the next one →
              </Link>
            ) : null}
          </div>
        ) : null}

        <section
          className="relative mx-auto mt-12 max-w-4xl"
          style={{ height: 180 + pathway.nodes.length * 210 }}
        >
          {pathway.nodes.map((node, index) => {
            const href = nodeHref(pathway.id, node);
            const generating = node.status === "generating";
            const left = columns[index % columns.length];
            const top = 24 + index * 210;
            const locked = !href;
            const isFocus = node.id === focus;
            const inner = (
              <div className="flex w-56 flex-col items-center text-center">
                {isFocus ? (
                  <span className="mb-3 rounded-full bg-[#0f766e] px-3 py-1 text-[11px] font-bold tracking-[0.16em] text-white">
                    YOU ARE HERE
                  </span>
                ) : index === 0 ? (
                  <span className="mb-3 rounded-full bg-[#10231f] px-3 py-1 text-[11px] font-bold tracking-[0.16em] text-white">
                    START HERE
                  </span>
                ) : null}
                <div
                  className={`grid h-28 w-28 place-items-center rounded-full border-4 shadow-[0_10px_24px_rgba(16,35,31,0.12)] ${
                    isFocus ? "pulse-ring border-[#0f766e]" : "border-white"
                  } ${locked ? "bg-[#eef3f1] text-[#94a3b8]" : "bg-white text-[#0f766e]"}`}
                >
                  {generating
                    ? "⏳"
                    : node.kind === "card"
                      ? locked
                        ? "🔒"
                        : "📘"
                      : locked
                        ? "🔒"
                        : "✓"}
                </div>
                <h2 className="mt-3 text-xl font-semibold">{node.title}</h2>
                <p className="mt-1 text-sm text-[#6b7f79]">
                  {generating ? "writing this card…" : node.subtitle}
                </p>
                {node.status === "failed" ? (
                  <button
                    className="mt-3 text-sm font-bold text-red-700"
                    onClick={async (event) => {
                      event.preventDefault();
                      await fetch(`/api/pathways/${pathway.id}/regenerate`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ nodeId: node.id }),
                      });
                    }}
                  >
                    Try again
                  </button>
                ) : null}
              </div>
            );

            return (
              <div key={node.id} className="absolute -translate-x-1/2" style={{ left: `${left}%`, top }}>
                {href ? (
                  <Link href={href} className="no-underline">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
