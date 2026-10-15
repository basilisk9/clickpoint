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
import { sanitizeBannerSvg } from "./sanitize";
import { getPathway, saveGuest, savePathway } from "./store";
import type {
  CardAccent,
  CardExample,
  CardLevel,
  CardMove,
  CardSpec,
  CardVisualKind,
  GuestRecord,
  LessonPlan,
  PathwayBanner,
  PathwayNode,
  PathwayOutline,
  PathwayRecord,
  QuizPayload,
  QuizQuestion,
} from "./types";

const jobs = new Set<string>();

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

/* ------------------------------------------------------------------ */
/* Card normalization                                                  */
/*                                                                     */
/* The model returns a CardSpec, but we never trust it blindly: every  */
/* field is coerced to the right shape and every enum is checked       */
/* against the allowed set. A malformed field degrades to a sane       */
/* default instead of breaking the renderer, so a card can never be    */
/* "half-rendered" the way a broken HTML document could.               */
/* ------------------------------------------------------------------ */

const ACCENTS: CardAccent[] = ["pine", "blood", "cobalt", "ember", "gold"];
const VISUAL_KINDS: CardVisualKind[] = ["landscape", "bars", "area", "none"];
const LEVELS: CardLevel[] = ["warm", "firm", "brutal", "transfer"];

function asEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asObjectList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asObject) : [];
}

function normalizeMove(raw: Record<string, unknown>, index: number): CardMove {
  return {
    name: asString(raw.name, `Move ${index + 1}`),
    trigger: asString(raw.trigger, "when this pattern appears"),
    formula: asString(raw.formula, ""),
    body: asString(raw.body, ""),
    check: asString(raw.check, ""),
  };
}

function normalizeExample(
  raw: Record<string, unknown>,
  index: number,
  fallbackLevel: CardLevel,
): CardExample {
  return {
    level: asEnum(raw.level, LEVELS, fallbackLevel),
    source: asString(raw.source, `example ${index + 1}`),
    title: asString(raw.title, `Worked example ${index + 1}`),
    prompt: asString(raw.prompt, ""),
    steps: asStringList(raw.steps, []),
    takeaway: asString(raw.takeaway, ""),
  };
}

function normalizeCardSpec(raw: CardSpec, lesson: LessonPlan): CardSpec {
  const visual = asObject((raw as Record<string, unknown>).visual);
  const formal = asObject((raw as Record<string, unknown>).formal);
  const invariant = asObject(formal.invariant);
  const ledger = asObject(formal.ledger);
  const trick = asObject(formal.trick);
  const checks = asObject(formal.checks);
  const scope = asObject(formal.scope);
  const ramp = asObject((raw as Record<string, unknown>).ramp);
  const cta = asObject((raw as Record<string, unknown>).cta);
  const headingIn = Array.isArray(raw.heading) ? raw.heading.map((h) => asString(h)) : [];

  const movesIn = asObjectList(formal.moves);
  const moves: CardMove[] = movesIn.slice(0, 4).map(normalizeMove);
  if (!moves.length) {
    moves.push(normalizeMove({}, 0));
  }

  const examplesIn = asObjectList(ramp.examples);
  const levelOrder: CardLevel[] = ["warm", "firm", "brutal", "transfer"];
  const examples: CardExample[] = examplesIn
    .slice(0, 4)
    .map((item, i) => normalizeExample(item, i, levelOrder[Math.min(i, 3)]));

  const checkItems = asObjectList(checks.items)
    .slice(0, 4)
    .map((item) => ({
      latex: asString(item.latex, ""),
      note: asString(item.note, ""),
    }));

  return {
    title: asString(raw.title, lesson.title),
    pathSub: asString(raw.pathSub, lesson.subtitle),
    accent: asEnum(raw.accent, ACCENTS, "pine"),
    heading: [
      asString(headingIn[0], lesson.title),
      asString(headingIn[1], ""),
    ],
    lead: asString(raw.lead, lesson.topic),
    metaNeutral: asStringList(raw.metaNeutral, []).slice(0, 4),
    metaAccent: asString(raw.metaAccent, "CARD"),
    visual: {
      kind: asEnum(visual.kind, VISUAL_KINDS, "none"),
      heading: asString(visual.heading, ""),
      intro: asString(visual.intro, ""),
      chips: asStringList(visual.chips, []).slice(0, 4),
      caption: asString(visual.caption, ""),
    },
    formal: {
      heading: asString(formal.heading, "The formal part"),
      invariant: {
        label: asString(invariant.label, "THE INVARIANT"),
        headline: asString(invariant.headline, ""),
      },
      ledger: {
        latex: asString(ledger.latex, ""),
        note: asString(ledger.note, ""),
      },
      variablePart: asString(formal.variablePart, ""),
      moves,
      trick: {
        label: asString(trick.label, "THE TRICK"),
        body: asString(trick.body, ""),
      },
      checks: {
        title: asString(checks.title, "Sanity checks"),
        items: checkItems,
        after: asString(checks.after) || undefined,
      },
      scope: {
        title: asString(scope.title, "Where this applies"),
        body: asString(scope.body, ""),
      },
    },
    ramp: {
      heading: asString(ramp.heading, "Practice ramp"),
      intro: asString(ramp.intro, ""),
      examples,
    },
    cta: {
      heading: asString(cta.heading, "You have the picture."),
      body: asString(cta.body, ""),
    },
  };
}

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
const CARD_MAX_TOKENS = 16000;
// 9000 truncated quizzes when the model wrote more than five questions before
const QUIZ_MAX_TOKENS = 12000;

async function generateCard(rawNotes: string, lesson: LessonPlan): Promise<CardSpec> {
  const raw = await chatJson<CardSpec>(
    [
      { role: "system", content: CARD_SYSTEM },
      { role: "user", content: cardUser(rawNotes, lesson.topic, lesson.title) },
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
    const generated = await generateCard(pathway.rawNotes, lesson);
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

async function generateRemaining(pathwayId: string) {
  const pathway = await getPathway(pathwayId);
  if (!pathway) return;
  for (let i = 1; i < pathway.outline.lessons.length; i += 1) {
    await fillLesson(pathwayId, i);
  }
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
  guest.pathwayIds = [pathway.id, ...guest.pathwayIds.filter((id) => id !== pathway.id)];
  await saveGuest(guest);

  await fillLesson(pathway.id, 0);
  const ready = await getPathway(pathway.id);
  if (!ready) throw new Error("Pathway vanished while generating.");
  ready.status = "ready";
  await savePathway(ready);

  if (!jobs.has(ready.id)) {
    jobs.add(ready.id);
    void generateRemaining(ready.id).finally(() => jobs.delete(ready.id));
  }

  return ready;
}

export async function regenerateNode(pathway: PathwayRecord, nodeId: string) {
  const node = pathway.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error("Node not found.");
  await fillLesson(pathway.id, node.lessonIndex);
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