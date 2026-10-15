"use client";

import { useMemo, useState } from "react";
import type { PathwayNode, PathwayRecord, QuizQuestion } from "@/lib/types";

type GradeResult = {
  correctCount: number;
  total: number;
  passed: boolean;
  results: Array<{ id: string; correct: boolean }>;
};

export function QuizEngine({
  pathway,
  node,
}: {
  pathway: PathwayRecord;
  node: PathwayNode;
}) {
  const questions = node.quiz?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GradeResult | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(
    () => Object.fromEntries((result?.results ?? []).map((row) => [row.id, row.correct])),
    [result],
  );

  function setAnswer(question: QuizQuestion, value: string) {
    setAnswers((current) => ({ ...current, [question.id]: value }));
    setResult(null);
  }

  async function submit() {
    setBusy(true);
    const response = await fetch(`/api/pathways/${pathway.id}/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: node.id, answers }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      alert(data.error || "Could not grade quiz.");
      return;
    }
    setResult(data.result);
  }

  return (
    <div className="min-h-screen">
      <div className="shell py-8">
        <a href={`/path/${pathway.id}`} className="text-sm font-semibold text-[#5d726c] no-underline">
          ← Pathway
        </a>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#0f766e]">
          CHECKPOINT {String(node.lessonIndex + 1).padStart(2, "0")}
        </p>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight">{node.title}</h1>
        <p className="mt-3 max-w-2xl text-lg text-[#5d726c]">
          Units are already accounted for. Type the number. Pass with 75% to unlock the next card.
        </p>

        <div className="mt-8 grid gap-5">
          {questions.map((question, index) => (
            <article key={question.id} className="rounded-[28px] border border-[#d5e0db] bg-white p-6">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0f766e]">
                Q{index + 1}
              </p>
              <p className="mt-3 text-xl leading-8">{question.prompt}</p>
              {question.type === "mcq" ? (
                <div className="mt-4 grid gap-2">
                  {question.choices.map((choice, choiceIndex) => (
                    <label key={choice} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#d5e0db] px-4 py-3">
                      <input
                        type="radio"
                        name={question.id}
                        checked={answers[question.id] === String(choiceIndex)}
                        onChange={() => setAnswer(question, String(choiceIndex))}
                      />
                      <span>{choice}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-3">
                  <input
                    value={answers[question.id] ?? ""}
                    onChange={(event) => setAnswer(question, event.target.value)}
                    className="w-48 rounded-2xl border border-[#d5e0db] bg-[#f7faf8] px-4 py-3"
                    placeholder="number only"
                  />
                  {question.unit ? <span className="text-[#5d726c]">{question.unit}</span> : null}
                </div>
              )}
              {result ? (
                <p className={`mt-4 text-sm font-semibold ${byId[question.id] ? "text-teal-800" : "text-red-700"}`}>
                  {byId[question.id] ? "Correct." : "Not yet."} {question.explanation}
                </p>
              ) : null}
            </article>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-[#10231f] px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? "Grading…" : result ? "Retry quiz" : "Submit checkpoint"}
          </button>
          {result ? (
            <p className="text-lg font-semibold">
              {result.correctCount}/{result.total}
              {result.passed ? " · unlocked" : " · need 75%"}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
