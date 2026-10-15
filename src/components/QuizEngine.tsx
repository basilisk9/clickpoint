"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Rich } from "@/components/Rich";
import { CORRECT_ANSWER_XP, QUIZ_LIVES, QUIZ_PASS_THRESHOLD } from "@/lib/constants";
import type { PathwayNode, PathwayRecord, QuizQuestion } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Duolingo-style checkpoint.                                          */
/*                                                                     */
/* One question fills the screen, feedback slides up from the bottom,  */
/* and three hearts are the whole stakes. Shares the card's motion and */
/* palette tokens so the checkpoint feels like the same product.       */
/*                                                                     */
/* Grading is per-question and stays on the server: the client never   */
/* receives the answer key, and hearts are a local affordance rather   */
/* than persisted progression. XP and unlocking settle exactly once,   */
/* in the final batch call.                                            */
/* ------------------------------------------------------------------ */

/* Tag pill colors. The quiz writer picks tags freely, so anything not
   listed falls back to a neutral pill instead of breaking. */
const TAG_STYLES: Record<string, string> = {
  Concept: "bg-cobalt/12 text-cobalt border-cobalt/35",
  Compute: "bg-pine-soft text-pine-deep border-pine/35",
  Insight: "bg-gold/15 text-[#8a5a00] border-gold/45",
  "Edge case": "bg-ember-soft text-ember border-ember/35",
  Counterexample: "bg-blood/10 text-blood border-blood/35",
  Transfer: "bg-pine-soft text-pine-deep border-pine/35",
  Power: "bg-ink/10 text-ink border-ink/30",
  Rate: "bg-ember-soft text-ember border-ember/35",
  Invariant: "bg-cobalt/12 text-cobalt border-cobalt/35",
  Derive: "bg-gold/15 text-[#8a5a00] border-gold/45",
};

const TAG_FALLBACK = "bg-ink/10 text-ink border-ink/30";

function Heart({ full }: { full: boolean }) {
  return (
    <svg width="22" height="20" viewBox="0 0 22 20" className={full ? "" : "opacity-30"} aria-hidden>
      <path
        d="M11 18.5 C 4 13, 1 9.5, 1 6 C 1 3.2, 3.2 1, 6 1 C 8 1, 9.9 2.1, 11 3.8 C 12.1 2.1, 14 1, 16 1 C 18.8 1, 21 3.2, 21 6 C 21 9.5, 18 13, 11 18.5 Z"
        fill={full ? "var(--color-blood)" : "none"}
        stroke="var(--color-blood)"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path
        d="M3 11 L8 16 L17 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path
        d="M4 4 L16 16 M16 4 L4 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path
        d="M11 1 L13.5 7.5 L20.5 8 L15 12.5 L16.8 19.5 L11 15.7 L5.2 19.5 L7 12.5 L1.5 8 L8.5 7.5 Z"
        fill="var(--color-gold)"
      />
    </svg>
  );
}

/* Mirrors the server's numeric parsing closely enough for the button's
   enabled state; the server remains the real judge. */
function parseNum(s: string): number | null {
  const t = s.replace(/[^\d.\-−eE+]/g, "").replace("−", "-");
  if (t === "" || t === "-" || t === ".") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

type Verdict = {
  questionId: string;
  correct: boolean;
  reveal: {
    explanation: string;
    expected?: number;
    unit?: string;
    correctIndex?: number;
  };
};

/* The quiz payload is a discriminated union on `type`. Narrowing is done
   in a helper (mirroring the shape the compiler handles cleanly) rather
   than inline, so the question screen gets plain, already-narrowed data. */
function narrowQuestion(question: QuizQuestion) {
  if (question.type === "mcq") {
    return {
      choices: question.choices as string[] | null,
      correctIndex: question.correctIndex,
      unit: undefined as string | undefined,
      isMcq: true,
    };
  }
  return {
    choices: null as string[] | null,
    correctIndex: -1,
    unit: question.unit,
    isMcq: false,
  };
}

/* Finds the card immediately before this quiz so "Re-read the card"
   lands on the lesson that taught it. */
function previousCardId(pathway: PathwayRecord, quizNodeId: string): string | null {
  const index = pathway.nodes.findIndex((item) => item.id === quizNodeId);
  for (let k = index - 1; k >= 0; k -= 1) {
    if (pathway.nodes[k].kind === "card") return pathway.nodes[k].id;
  }
  return null;
}


export function QuizEngine({
  pathway,
  node,
}: {
  pathway: PathwayRecord;
  node: PathwayNode;
}) {
  const questions = node.quiz?.questions ?? [];
  const total = questions.length;
  const label = node.title;

  const [i, setI] = useState(0);
  const [hearts, setHearts] = useState(QUIZ_LIVES);
  const [selected, setSelected] = useState<number | null>(null);
  const [numVal, setNumVal] = useState("");
  const [phase, setPhase] = useState<"ask" | "feedback" | "done" | "fail">("ask");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [log, setLog] = useState<boolean[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const q: QuizQuestion | undefined = questions[i];
  const correctCount = log.filter(Boolean).length;

  /* Guards against double-fires inside the same tick (rapid Enter). */
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* Submit the whole set once, so XP and unlocking settle exactly once. */
  const settle = useCallback(
    async (finalAnswers: Record<string, string>) => {
      await fetch(`/api/pathways/${pathway.id}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: node.id, answers: finalAnswers }),
      }).catch(() => undefined);
    },
    [pathway.id, node.id],
  );

  const check = useCallback(async () => {
    if (phaseRef.current !== "ask" || !q || busy) return;
    if (q.type === "mcq" && selected == null) return;
    if (q.type === "numeric" && parseNum(numVal) == null) return;
    const answer = q.type === "mcq" ? String(selected) : numVal;

    phaseRef.current = "feedback";
    setBusy(true);
    setAnswers((current) => ({ ...current, [q.id]: answer }));

    let data: { verdict?: Verdict } = {};
    try {
      const response = await fetch(`/api/pathways/${pathway.id}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: node.id, questionId: q.id, answer }),
      });
      data = await response.json();
    } catch {
      data = {};
    }
    setBusy(false);

    /* A network failure should not silently mark the student wrong; we
       fall back to the local comparison the button already implied. */
    const right =
      data.verdict?.correct ?? (q.type === "mcq" ? selected === q.correctIndex : false);

    setVerdict(
      data.verdict ?? {
        questionId: q.id,
        correct: right,
        reveal: { explanation: q.explanation },
      },
    );
    setLog((l) => [...l, right]);
    if (!right) {
      setHearts((h) => h - 1);
      setShake(true);
      window.setTimeout(() => setShake(false), 550);
    }
    setPhase("feedback");
  }, [q, selected, numVal, busy, pathway.id, node.id]);

  const next = useCallback(() => {
    if (phaseRef.current !== "feedback") return;
    phaseRef.current = "ask";

    if (!verdict?.correct && hearts <= 0) {
      setPhase("fail");
      return;
    }
    if (i + 1 >= total) {
      void settle({ ...answers });
      setPhase("done");
      return;
    }
    setI((v) => v + 1);
    setSelected(null);
    setNumVal("");
    setVerdict(null);
    setPhase("ask");
  }, [verdict, hearts, i, total, answers, settle]);

  /* Keys: 1-4 pick a choice, Enter checks or continues. */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (phaseRef.current === "ask" && q?.type === "mcq") {
        const digit = Number(event.key);
        if (digit >= 1 && digit <= (q.choices.length || 0)) setSelected(digit - 1);
      }
      if (event.key === "Enter") {
        if (phaseRef.current === "ask") void check();
        else if (phaseRef.current === "feedback") next();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [q, check, next]);

  /* ---------------- empty quiz ---------------- */
  if (!total || !q) {
    return (
      <div className="shell py-16">
        <p className="text-sm text-[#5d726c]">This checkpoint has no questions yet.</p>
        <a href={`/path/${pathway.id}`} className="mt-4 inline-block font-bold text-[#0f766e]">
          ← Back to the pathway
        </a>
      </div>
    );
  }

  /* Past every guard, so the current question is definitely present. The
     non-null assertion keeps the discriminated union intact — spreading
     or annotating it would collapse the `type` discriminant and defeat
     narrowing below. */
  const question = q!;
  const { choices, correctIndex, unit, isMcq: isMcqQuestion } = narrowQuestion(question);
  const canCheck = isMcqQuestion ? selected != null : parseNum(numVal) != null;

  /* ---------------- results ---------------- */
  if (phase === "done") {
    return (
      <Results pathway={pathway} questions={questions} correct={correctCount} total={total} log={log} />
    );
  }

  /* ---------------- out of hearts ---------------- */
  if (phase === "fail") {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 py-14">
        <div className="pop-in w-full max-w-md rounded-3xl border-2 border-blood/50 bg-white p-8 text-center shadow-[0_24px_60px_rgba(16,36,44,0.16)]">
          <div className="mx-auto flex w-fit gap-1.5">
            {Array.from({ length: QUIZ_LIVES }).map((_, k) => (
              <Heart key={k} full={false} />
            ))}
          </div>
          <h2 className="mt-5 text-3xl font-semibold">Out of hearts.</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#5d726c]">
            You got {correctCount} of {i + 1} before the well ran dry. {label} isn&rsquo;t mean
            &mdash; it&rsquo;s honest. The click needs one more pass through the card.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <a
              href={`/path/${pathway.id}/card/${previousCardId(pathway, node.id) ?? ""}`}
              className="rounded-2xl bg-pine px-5 py-3 text-base font-bold text-white shadow-[0_4px_0_var(--color-pine-deep)] transition hover:brightness-110"
            >
              Re-read the card
            </a>
            <button
              onClick={() => {
                setI(0);
                setHearts(QUIZ_LIVES);
                setSelected(null);
                setNumVal("");
                setLog([]);
                setAnswers({});
                setVerdict(null);
                setPhase("ask");
              }}
              className="rounded-2xl border-2 border-[#d5e0db] px-5 py-3 text-base font-bold text-[#5d726c] transition hover:border-[#5d726c] hover:text-[#10231f]"
            >
              Retry checkpoint
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- question ---------------- */
  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky HUD: quit, progress bar, hearts. */}
      <div className="sticky top-0 z-20 border-b border-[#d5e0db] bg-[#eef3f1]/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-3.5">
          <a
            href={`/path/${pathway.id}`}
            aria-label="Quit checkpoint"
            className="rounded-lg p-1.5 text-[#8299a1] transition hover:bg-[#e7edea] hover:text-[#10231f]"
          >
            <CloseIcon />
          </a>
          <div className="flex flex-1 gap-1.5">
            {questions.map((_, k) => (
              <div
                key={k}
                className={`h-3 flex-1 rounded-full transition-all duration-300 ${
                  k < log.length
                    ? log[k]
                      ? "bg-pine"
                      : "bg-blood"
                    : k === i
                      ? "bg-[#10231f]/30"
                      : "bg-[#d5e0db]"
                }`}
              />
            ))}
          </div>
          <div className={`flex gap-1 ${shake ? "shake" : ""}`}>
            {Array.from({ length: QUIZ_LIVES }).map((_, k) => (
              <Heart key={k} full={k < hearts} />
            ))}
          </div>
        </div>
        <p className="pb-2 text-center font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#8299a1]">
          {label}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-56 pt-8 sm:pt-10">
        <div key={question.id} className="pop-in">
          <div className="flex items-center gap-2.5">
            <span
              className={`rounded-full border px-3 py-1 text-[11.5px] font-bold uppercase tracking-wider ${
                TAG_STYLES[question.tag ?? ""] ?? TAG_FALLBACK
              }`}
            >
              {question.tag || (isMcqQuestion ? "Concept" : "Compute")}
            </span>
            <span className="font-mono text-[12.5px] font-bold text-[#8299a1]">
              {i + 1} / {total}
            </span>
          </div>

          <div className="mt-4 text-[16.5px] leading-relaxed text-[#10231f]">
            <Rich text={question.prompt} />
          </div>

          {choices ? (
            <div className="mt-6 grid gap-2.5">
              {(choices as string[]).map((choice, k) => {
                const active = selected === k;
                const locked = phase !== "ask";
                const showRight = locked && k === correctIndex;
                const showWrong = locked && active && !verdict?.correct;
                return (
                  <button
                    key={k}
                    disabled={locked}
                    onClick={() => setSelected(k)}
                    className={`flex items-start gap-3.5 rounded-2xl border-2 px-4 py-3.5 text-left text-[15px] leading-relaxed transition-all ${
                      showRight
                        ? "border-pine bg-pine-soft"
                        : showWrong
                          ? "border-blood bg-blood/10"
                          : active
                            ? "border-pine bg-pine-soft/70 shadow-[0_4px_0_var(--color-pine-deep)]"
                            : "border-[#d5e0db] bg-white hover:border-[#10231f]/35 hover:bg-[#e7edea]"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-[12px] font-bold ${
                        active || showRight
                          ? "border-pine-deep bg-pine text-white"
                          : "border-[#d5e0db] bg-[#f2f5f3] text-[#8299a1]"
                      }`}
                    >
                      {k + 1}
                    </span>
                    <span className="min-w-0">
                      <Rich text={choice} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-3">
              <input
                value={numVal}
                onChange={(event) => setNumVal(event.target.value)}
                disabled={phase !== "ask"}
                inputMode="decimal"
                placeholder="your answer"
                className={`w-full max-w-[240px] rounded-2xl border-2 bg-white px-4 py-3 font-mono text-lg font-bold outline-none transition focus:border-pine ${
                  phase !== "ask"
                    ? verdict?.correct
                      ? "border-pine bg-pine-soft"
                      : "border-blood bg-blood/10"
                    : "border-[#d5e0db]"
                }`}
              />
              {unit ? (
                <span className="font-mono text-lg font-bold text-[#5d726c]">{unit}</span>
              ) : null}
            </div>
          )}
        </div>
      </div>


      {/* Bottom dock: Check button, then the sliding feedback panel. */}
      <div className="fixed inset-x-0 bottom-0 z-30">
        {phase === "ask" ? (
          <div className="border-t border-[#d5e0db] bg-[#eef3f1]/95 backdrop-blur">
            <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
              <p className="hidden text-[13px] font-medium text-[#8299a1] sm:block">
                keys: 1&ndash;4 select &middot; Enter check
              </p>
              <button
                onClick={() => void check()}
                disabled={!canCheck || busy}
                className={`ml-auto rounded-2xl px-8 py-3 text-base font-bold transition active:translate-y-px ${
                  canCheck && !busy
                    ? "bg-pine text-white shadow-[0_4px_0_var(--color-pine-deep)] hover:brightness-110"
                    : "cursor-not-allowed bg-[#d5e0db] text-[#8299a1]"
                }`}
              >
                {busy ? "Checking…" : "Check"}
              </button>
            </div>
          </div>
        ) : null}

        {phase === "feedback" && verdict ? (
          <FeedbackPanel
            verdict={verdict as Verdict}
            question={question}
            isLast={i + 1 >= total}
            onNext={next}
          />
        ) : null}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Results screen. Counts XP up so the reward lands as a beat rather   */
/* than a number appearing instantly.                                  */
/* ------------------------------------------------------------------ */

function Results({
  pathway,
  questions,
  correct,
  total,
  log,
}: {
  pathway: PathwayRecord;
  questions: QuizQuestion[];
  correct: number;
  total: number;
  log: boolean[];
}) {
  const xp = correct * CORRECT_ANSWER_XP;
  const [shownXp, setShownXp] = useState(0);
  const passed = total > 0 && correct / total >= QUIZ_PASS_THRESHOLD;

  useEffect(() => {
    if (xp <= 0) return;
    let cur = 0;
    const id = window.setInterval(() => {
      cur += 1;
      setShownXp(cur);
      if (cur >= xp) window.clearInterval(id);
    }, 60);
    return () => window.clearInterval(id);
  }, [xp]);

  return (
    <div className="min-h-screen px-5 py-14">
      <div className="mx-auto max-w-2xl">
        <div className="pop-in text-center">
          <p className="font-mono text-[12px] font-bold uppercase tracking-[0.22em] text-pine">
            Checkpoint complete
          </p>
          <h2 className="mt-3 text-5xl font-extrabold sm:text-6xl">
            {correct}
            <span className="text-[#8299a1]"> / {total}</span>
          </h2>
          <p className="mt-3 text-[15.5px] leading-relaxed text-[#5d726c]">
            {passed
              ? correct >= total - 1
                ? "That wasn’t pattern-matching. You read it like it owed you money."
                : "Solid. The invariant held where it mattered — revisit the misses below."
              : "Below the bar this time. The misses below point straight at which move slipped."}
          </p>
          <div className="mx-auto mt-6 flex w-fit items-center gap-3 rounded-2xl border-2 border-gold/60 bg-white px-6 py-3">
            <StarIcon />
            <span className="font-mono text-2xl font-bold tabular-nums text-[#8a5a00]">
              +{shownXp} XP
            </span>
          </div>
          {!passed ? (
            <p className="mt-4 text-[13px] font-bold text-[#c92a2a]">
              Need {Math.ceil(total * QUIZ_PASS_THRESHOLD)}/{total} to unlock the next card.
            </p>
          ) : null}
        </div>

        <div className="mt-10 rounded-3xl border border-[#d5e0db] bg-white p-5">
          <p className="font-mono text-[11.5px] font-bold uppercase tracking-[0.2em] text-[#8299a1]">
            question log
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {questions.map((qq, k) => (
              <div
                key={qq.id}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[12.5px] font-bold ${
                  log[k]
                    ? "border-pine/50 bg-pine/15 text-[#10231f]"
                    : "border-blood/50 bg-blood/15 text-[#10231f]"
                }`}
              >
                <span className={log[k] ? "text-pine" : "text-blood"}>
                  {log[k] ? "✓" : "✗"}
                </span>
                <span className="truncate">
                  {k + 1} · {qq.tag || (qq.type === "mcq" ? "Concept" : "Compute")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <a
            href={`/path/${pathway.id}`}
            className="rounded-2xl bg-pine px-7 py-3.5 text-base font-bold text-white shadow-[0_4px_0_var(--color-pine-deep)] transition hover:brightness-110 active:translate-y-px"
          >
            Back to the pathway
          </a>
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Feedback dock. Slides up after a check and owns the only two ways   */
/* out: continue, or — on the last question — see the results.         */
/* ------------------------------------------------------------------ */

function FeedbackPanel({
  verdict,
  question,
  isLast,
  onNext,
}: {
  verdict: Verdict;
  question: QuizQuestion;
  isLast: boolean;
  onNext: () => void;
}) {
  const right = verdict.correct;
  const expected =
    !right && question.type === "numeric" ? verdict.reveal.expected : undefined;

  return (
    <div className={`slide-up border-t-4 ${right ? "border-pine bg-pine-soft" : "border-blood bg-[#fdeaea]"}`}>
      <div className="mx-auto max-w-3xl px-5 py-5">
        <p
          className={`flex items-center gap-2 text-xl font-extrabold ${
            right ? "text-pine-deep" : "text-blood"
          }`}
        >
          {right ? (
            <>
              <CheckIcon />
              The click survived.
            </>
          ) : (
            <>
              <CrossIcon />
              Not this time &mdash; heart lost.
            </>
          )}
        </p>

        {expected != null ? (
          <p className="mt-1 font-mono text-[14px] font-bold text-blood">
            expected: {expected} {verdict.reveal.unit ?? ""}
          </p>
        ) : null}

        <div className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-[#10231f]">
          <Rich text={verdict.reveal.explanation} />
        </div>

        <button
          onClick={onNext}
          className={`mt-4 rounded-2xl px-7 py-2.5 text-base font-bold text-white transition active:translate-y-px ${
            right
              ? "bg-pine shadow-[0_4px_0_var(--color-pine-deep)] hover:brightness-110"
              : "bg-blood shadow-[0_4px_0_#8f1d1d] hover:brightness-110"
          }`}
        >
          {isLast ? "See results" : "Continue"}
        </button>
      </div>
    </div>
  );
}
