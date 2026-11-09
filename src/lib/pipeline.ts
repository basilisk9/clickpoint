import { FINISH_LESSON_XP, MAX_LESSONS, MIN_LESSONS, QUESTIONS_PER_QUIZ } from "./constants";
import { chatJson } from "./ai";
import { createId } from "./ids";
import {
  BANNER_SYSTEM,
  CARD_SYSTEM,
  OUTLINE_SYSTEM,
  QUIZ_SYSTEM,
  bannerUser,
  cardUser,
  outlineUser,
  quizUser,
} from "./prompts";
import { after } from "next/server";
/* Card normalization lives in card.ts: the renderer needs the same code, so it
   stays free of server-only imports. */
import { normalizeCardSpec } from "./card";
import { sanitizeBannerSvg } from "./sanitize";
import {
  claimFilling,
  getGuest,
  getPathway,
  releaseFilling,
  saveGuest,
  savePathway,
} from "./store";
import type {
  CardSpec,
  GuestRecord,
  LessonPlan,
  PathwayBanner,
  PathwayNode,
  PathwayOutline,
  PathwayRecord,
  QuizPayload,
  QuizQuestion,
} from "./types";

function clampLessons(count: number, available: number) {
  const n = Number.isFinite(count) ? Math.round(count) : available;
  return Math.min(MAX_LESSONS, Math.max(MIN_LESSONS, Math.min(n, available || n)));
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const next = value.map((item) => asString(item)).filter(Boolean);
  return next.length ? next : fallback;
}

/* How long a regenerate request waits for the background fill to release the
   pathway lease before giving up. A lesson fill takes 30-60s, so this queues
   behind one lesson and still answers inside the route's 300s ceiling. */
const REGENERATE_WAIT_MS = 150_000;
const REGENERATE_POLL_MS = 2_000;

function normalizeOutline(raw: PathwayOutline, notesLength: number): PathwayOutline {
  const lessonsIn = Array.isArray(raw.lessons) ? raw.lessons : [];
  const lessonCount = clampLessons(raw.lessonCount || lessonsIn.length, lessonsIn.length || 3);
  const lessons: LessonPlan[] = [];

  for (let i = 0; i < lessonCount; i += 1) {
    const item = lessonsIn[i] ?? {};
    const compression =
      item.compression &&
      Number.isFinite(item.compression.from) &&
      Number.isFinite(item.compression.to)
        ? { from: Number(item.compression.from), to: Number(item.compression.to) }
        : undefined;
    lessons.push({
      id: asString(item.id, `l${i + 1}`),
      title: asString(item.title, `Lesson ${i + 1}`),
      subtitle: asString(item.subtitle, "open the card"),
      topic: asString(item.topic, "Teach the core idea from the notes."),
      compression,
    });
  }

  return {
    lessonCount: lessons.length,
    subject: asString(raw.subject, "Notes"),
    unitLabel: asString(raw.unitLabel, `UNIT · ${lessons.length} CARDS`),
    sourceTag: asString(raw.sourceTag, notesLength > 4000 ? "long notes" : "notes"),
    lessons,
  };
}

function normalizeBanner(raw: PathwayBanner, outline: PathwayOutline): PathwayBanner {
  const stats = asStringList(raw.stats, [
    `${outline.lessons.length} cards`,
    `${outline.lessons.length} checkpoints`,
    `${outline.lessons.length * QUESTIONS_PER_QUIZ} questions`,
    outline.sourceTag,
  ]);
  return {
    title: asString(raw.title, outline.subject),
    kicker: asString(raw.kicker, outline.unitLabel),
    blurb: asString(raw.blurb, "Your notes, compressed into a path you can actually walk."),
    stats,
    floating: asStringList(raw.floating, []),
    bannerSvg: sanitizeBannerSvg(asString(raw.bannerSvg, "")),
    bannerCaption: asString(raw.bannerCaption, ""),
  };
}

function buildNodes(outline: PathwayOutline): PathwayNode[] {
  const nodes: PathwayNode[] = [];
  outline.lessons.forEach((lesson, index) => {
    nodes.push({
      id: createId("card"),
      kind: "card",
      lessonIndex: index,
      title: lesson.title,
      subtitle: `card ${String(index + 1).padStart(2, "0")} · ${lesson.subtitle}`,
      status: index === 0 ? "generating" : "locked",
    });
    nodes.push({
      id: createId("quiz"),
      kind: "quiz",
      lessonIndex: index,
      title: `Checkpoint ${String(index + 1).padStart(2, "0")}`,
      subtitle: `unlocks after card ${String(index + 1).padStart(2, "0")}`,
      status: "locked",
    });
  });
  return nodes;
}

function normalizeQuiz(raw: QuizPayload): QuizPayload {
  const questions: QuizQuestion[] = [];
  const incoming = Array.isArray(raw.questions) ? raw.questions : [];
  incoming.forEach((item, index) => {
    if (questions.length >= QUESTIONS_PER_QUIZ) return;
    if (item.type === "mcq" && Array.isArray(item.choices) && item.choices.length >= 2) {
      questions.push({
        id: asString(item.id, `q${index + 1}`),
        type: "mcq",
        tag: asString(item.tag) || undefined,
        prompt: asString(item.prompt, "Choose the best framing."),
        choices: item.choices.map((choice) => asString(choice)).filter(Boolean),
        correctIndex: Math.max(0, Number(item.correctIndex) || 0),
        explanation: asString(item.explanation, ""),
      });
      return;
    }
    if (item.type === "numeric" && Number.isFinite(Number(item.answer))) {
      questions.push({
        id: asString(item.id, `q${index + 1}`),
        type: "numeric",
        tag: asString(item.tag) || undefined,
        prompt: asString(item.prompt, "Find the value."),
        answer: Number(item.answer),
        unit: asString(item.unit) || undefined,
        tolerance: Number.isFinite(Number(item.tolerance)) ? Number(item.tolerance) : undefined,
        explanation: asString(item.explanation, ""),
      });
    }
  });
  if (!questions.length) throw new Error("Quiz had no usable questions.");
  return { questions };
}

// max_tokens is a CAP, not a target: raising it costs nothing when the model
// stops early, and is the only thing that saves us when a reasoning model
// spends several thousand hidden tokens before writing any visible output.
// Raised to 24000 when cards became section-based: a card that carries a
// figure, a dictionary, a derivation and five examples is genuinely bigger
// than the old fixed six-region skeleton.
const CARD_MAX_TOKENS = 24000;
// 9000 truncated quizzes when the model wrote more than five questions before
const QUIZ_MAX_TOKENS = 12000;

async function generateCard(
  rawNotes: string,
  lesson: LessonPlan,
  nextTitle?: string,
): Promise<CardSpec> {
  const raw = await chatJson<CardSpec>(
    [
      { role: "system", content: CARD_SYSTEM },
      {
        role: "user",
        content: cardUser(rawNotes, lesson.topic, lesson.title, nextTitle),
      },
    ],
    { maxTokens: CARD_MAX_TOKENS, temperature: 0.45 },
  );
  return normalizeCardSpec(raw, lesson);
}

async function generateQuiz(rawNotes: string, lesson: LessonPlan) {
  const raw = await chatJson<QuizPayload>(
    [
      { role: "system", content: QUIZ_SYSTEM },
      { role: "user", content: quizUser(rawNotes, lesson.topic, lesson.title) },
    ],
    { maxTokens: QUIZ_MAX_TOKENS, temperature: 0.35 },
  );
  return normalizeQuiz(raw);
}

async function fillLesson(pathwayId: string, lessonIndex: number) {
  const pathway = await getPathway(pathwayId);
  if (!pathway) return;
  const lesson = pathway.outline.lessons[lessonIndex];
  const card = pathway.nodes.find((node) => node.kind === "card" && node.lessonIndex === lessonIndex);
  const quiz = pathway.nodes.find((node) => node.kind === "quiz" && node.lessonIndex === lessonIndex);
  if (!lesson || !card || !quiz) return;

  card.status = "generating";
  await savePathway(pathway);

  try {
    const generated = await generateCard(
      pathway.rawNotes,
      lesson,
      pathway.outline.lessons[lessonIndex + 1]?.title,
    );
    const latest = await getPathway(pathwayId);
    const live = latest ?? pathway;
    const liveCard = live.nodes.find((node) => node.id === card.id) ?? card;
    const liveQuiz = live.nodes.find((node) => node.id === quiz.id) ?? quiz;
    const prevQuiz = live.nodes.find(
      (node) => node.kind === "quiz" && node.lessonIndex === lessonIndex - 1,
    );
    liveCard.card = generated;
    if (live.completedNodeIds.includes(liveCard.id)) {
      liveCard.status = "complete";
    } else if (lessonIndex === 0 || prevQuiz?.status === "complete") {
      liveCard.status = "available";
    } else {
      liveCard.status = "locked";
    }
    liveCard.error = undefined;

    await savePathway(live);

    liveQuiz.status = liveQuiz.quiz ? liveQuiz.status : "generating";
    await savePathway(live);
    liveQuiz.quiz = await generateQuiz(live.rawNotes, lesson);
    const afterQuiz = (await getPathway(pathwayId)) ?? live;
    const savedQuiz = afterQuiz.nodes.find((node) => node.id === quiz.id) ?? liveQuiz;
    const savedCard = afterQuiz.nodes.find((node) => node.id === card.id) ?? liveCard;
    savedQuiz.quiz = liveQuiz.quiz;
    savedQuiz.status = afterQuiz.completedNodeIds.includes(savedCard.id) ? "available" : "locked";
    if (afterQuiz.completedNodeIds.includes(savedQuiz.id)) savedQuiz.status = "complete";
    savedQuiz.error = undefined;
    await savePathway(afterQuiz);
    Object.assign(pathway, afterQuiz);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    if (!card.card) {
      card.status = "failed";
      card.error = message;
    }
    if (!quiz.quiz) {
      quiz.status = "failed";
      quiz.error = message;
    }
    await savePathway(pathway);
  }
}

/* A node is resumable when it was supposed to get content, hasn't yet, and
   wasn't deliberately failed (failed lessons have a manual "regenerate" button,
   so we don't silently re-run them on every poll). This is exactly the state a
   killed run leaves behind: card/quiz set to "generating" but with no content. */
function hasResumableNodes(pathway: PathwayRecord): boolean {
  return pathway.nodes.some(
    (node) =>
      (node.kind === "card" && !node.card && node.status !== "failed") ||
      (node.kind === "quiz" && !node.quiz && node.status !== "failed"),
  );
}

/* Fill every lesson that isn't already done, in order. Re-reads before each
   iteration because fillLesson mutates its own copy, not the caller's. Starting
   at 0 (not 1) means this also recovers a run that died during the first
   lesson; already-complete lessons are skipped, so a resume never re-burns LLM
   calls for work that already succeeded. */
async function generateRemaining(pathwayId: string) {
  let pathway = await getPathway(pathwayId);
  if (!pathway) return;
  for (let i = 0; i < pathway.outline.lessons.length; i += 1) {
    const card = pathway.nodes.find(
      (node) => node.kind === "card" && node.lessonIndex === i,
    );
    const quiz = pathway.nodes.find(
      (node) => node.kind === "quiz" && node.lessonIndex === i,
    );
    if (card?.card && quiz?.quiz) continue;
    await fillLesson(pathwayId, i);
    pathway = (await getPathway(pathwayId)) ?? pathway;
  }
}

/* Self-heal: if this pathway has unfinished (non-failed) nodes and no live fill
   holds the lease, take the lease and resume in the background. Called from the
   pathway GET route, which PathwayView polls every few seconds — so a run killed
   mid-generation is picked up automatically once its lease expires, with no cron
   and no manual step. No-op while a run is alive (the lease is held) or when
   there's nothing left to fill. */
export async function maybeResumeGeneration(
  pathway: PathwayRecord,
): Promise<void> {
  if (pathway.status === "failed") return;
  if (!hasResumableNodes(pathway)) return;
  if (!(await claimFilling(pathway.id))) return;
  after(async () => {
    try {
      await generateRemaining(pathway.id);
    } finally {
      await releaseFilling(pathway.id);
    }
  });
}

export async function createPathwayFromNotes(guest: GuestRecord, rawNotes: string) {
  const notes = rawNotes.trim();
  if (notes.length < 40) {
    throw new Error("Those notes are too short to build a path.");
  }

  const outlineRaw = await chatJson<PathwayOutline>(
    [
      { role: "system", content: OUTLINE_SYSTEM },
      { role: "user", content: outlineUser(notes) },
    ],
    { maxTokens: 12000, temperature: 0.3 },
  );
  const outline = normalizeOutline(outlineRaw, notes.length);

  const bannerRaw = await chatJson<PathwayBanner>(
    [
      { role: "system", content: BANNER_SYSTEM },
      { role: "user", content: bannerUser(JSON.stringify(outline, null, 2)) },
    ],
    { maxTokens: 12000, temperature: 0.5 },
  );
  const banner = normalizeBanner(bannerRaw, outline);
  const nodes = buildNodes(outline);

  const pathway: PathwayRecord = {
    id: createId("path"),
    guestId: guest.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "generating",
    rawNotes: notes,
    outline,
    banner,
    nodes,
    xp: 0,
    completedNodeIds: [],
  };

  await savePathway(pathway);

  /* Re-read before writing so we append to the freshest record. The route
     stamps lastPathwayAt on the guest before calling us, and another request
     could have touched it since — writing our stale copy would drop that. */
  const fresh = (await getGuest(guest.id)) ?? guest;
  fresh.pathwayIds = [pathway.id, ...fresh.pathwayIds.filter((id) => id !== pathway.id)];
  await saveGuest(fresh);
  guest.pathwayIds = fresh.pathwayIds;

  await fillLesson(pathway.id, 0);
  const ready = await getPathway(pathway.id);
  if (!ready) throw new Error("Pathway vanished while generating.");
  ready.status = "ready";
  await savePathway(ready);

  /* Vercel tears the function down the moment the response is returned, so a
     bare `void generateRemaining(...)` would be cut off mid-run. `after()`
     keeps the invocation alive until the work settles, bounded by the route's
     maxDuration (300s on Hobby). The DB claim replaces the old in-process
     `jobs` Set, which can't dedupe across serverless invocations. */
  if (await claimFilling(ready.id)) {
    after(async () => {
      try {
        await generateRemaining(ready.id);
      } finally {
        await releaseFilling(ready.id);
      }
    });
  }

  return ready;
}

/* Regenerating a lesson during the background fill used to be a plain
   read-modify-write into fillLesson: both writers re-read the whole record,
   so whichever saved last erased the other's card or quiz. It now takes the
   same lease the background fill takes, and waits for the holder to finish
   instead of writing underneath it. */
export async function regenerateNode(pathway: PathwayRecord, nodeId: string) {
  const node = pathway.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error("Node not found.");

  let claimed = await claimFilling(pathway.id);
  let waited = 0;
  while (!claimed && waited < REGENERATE_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, REGENERATE_POLL_MS));
    waited += REGENERATE_POLL_MS;
    claimed = await claimFilling(pathway.id);
  }
  if (!claimed) {
    throw new Error(
      "This pathway is still generating. Try again in a minute.",
    );
  }

  try {
    await fillLesson(pathway.id, node.lessonIndex);
  } finally {
    await releaseFilling(pathway.id);
  }

  const next = await getPathway(pathway.id);
  if (!next) throw new Error("Pathway vanished.");
  return next;
}

export function awardLessonXp(pathway: PathwayRecord, nodeId: string) {
  if (pathway.completedNodeIds.includes(nodeId)) return pathway;
  pathway.completedNodeIds.push(nodeId);
  pathway.xp += FINISH_LESSON_XP;
  const node = pathway.nodes.find((item) => item.id === nodeId);
  if (node) node.status = "complete";
  const quiz = pathway.nodes.find(
    (item) => item.kind === "quiz" && item.lessonIndex === node?.lessonIndex,
  );
  if (quiz && quiz.quiz) quiz.status = "available";
  return pathway;
}

export function unlockNextCard(pathway: PathwayRecord, quizNodeId: string) {
  const quiz = pathway.nodes.find((item) => item.id === quizNodeId);
  if (!quiz) return pathway;
  quiz.status = "complete";
  if (!pathway.completedNodeIds.includes(quiz.id)) {
    pathway.completedNodeIds.push(quiz.id);
  }
  const next = pathway.nodes.find(
    (item) => item.kind === "card" && item.lessonIndex === quiz.lessonIndex + 1,
  );
  if (next && (next.card || next.html)) next.status = "available";
  return pathway;
}
