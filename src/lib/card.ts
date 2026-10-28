import { resolveScene } from "./scenes";
import type {
  CardAccent,
  CardExample,
  CardLevel,
  CardMove,
  CardSection,
  CardSpec,
  CardVisual,
  CardVisualKind,
  LessonPlan,
} from "./types";

/* ------------------------------------------------------------------ */
/* Card normalization                                                  */
/*                                                                     */
/* The model returns a CardSpec, but we never trust it blindly: every  */
/* field is coerced to the right shape and every enum is checked       */
/* against the allowed set. A malformed field degrades to a sane       */
/* default instead of breaking the renderer, so a card can never be    */
/* "half-rendered" the way a broken HTML document could.               */
/*                                                                     */
/* This file is shared by the pipeline (normalizing fresh model        */
/* output) and by CardRenderer (reading records written before the     */
/* sections refactor), which is why it holds no server-only imports.   */
/* ------------------------------------------------------------------ */

export const ACCENTS: CardAccent[] = ["pine", "blood", "cobalt", "ember", "gold"];
export const VISUAL_KINDS: CardVisualKind[] = [
  "landscape",
  "bars",
  "area",
  "disk",
  "vector",
  "plot",
  "oscillation",
  "none",
];
/* Easiest first. A ramp that starts at "brutal" is not a ramp. */
export const LEVELS: CardLevel[] = ["breeze", "warm", "firm", "brutal", "transfer"];

export function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function asStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const next = value.map((item) => asString(item)).filter(Boolean);
  return next.length ? next : fallback;
}

export function asEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asObjectList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asObject) : [];
}

function asNumber(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/* A prose field that is really just a bare LaTeX blob is common: the model
   sometimes puts "E = \frac{1}{2}mv^2" in a body. Wrap it so the renderer
   shows an equation instead of raw backslashes. Only applied when the text
   has backslash commands and no dollar signs at all, which cannot be a
   legitimate sentence. */
export function asRich(value: unknown, fallback = "") {
  const text = asString(value, fallback);
  if (!text || text.includes("$")) return text;
  if (!/\\[a-zA-Z]/.test(text)) return text;
  return `$$${text}$$`;
}

/* ------------------------------------------------------------------ */
/* Piece normalizers                                                   */
/* ------------------------------------------------------------------ */

function normalizeMove(raw: Record<string, unknown>, index: number): CardMove {
  return {
    name: asString(raw.name, `Move ${index + 1}`),
    trigger: asString(raw.trigger, "when this pattern appears"),
    formula: asString(raw.formula, ""),
    body: asRich(raw.body),
    check: asRich(raw.check),
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
    prompt: asRich(raw.prompt),
    steps: asStringList(raw.steps, []).map((step) => asRich(step)),
    takeaway: asRich(raw.takeaway),
  };
}

function normalizeExamples(value: unknown): CardExample[] {
  return asObjectList(value)
    .slice(0, 5)
    .map((item, i) => normalizeExample(item, i, LEVELS[Math.min(i, LEVELS.length - 1)]))
    .filter((item) => item.prompt || item.steps.length);
}

function normalizeVisual(raw: unknown): CardVisual | null {
  const visual = asObject(raw);
  const kind = asEnum(visual.kind, VISUAL_KINDS, "none");
  if (kind === "none") return null;

  const sceneId = asString(visual.scene) || undefined;
  const scene = resolveScene(sceneId, kind);
  if (!scene) return null;

  const paramsIn = asObject(visual.params);
  const params: Record<string, number> = {};
  for (const [key, value] of Object.entries(paramsIn)) {
    const n = asNumber(value);
    if (n !== undefined) params[key] = n;
  }

  return {
    kind,
    scene: scene.id,
    params: Object.keys(params).length ? params : undefined,
    heading: asString(visual.heading),
    intro: asRich(visual.intro),
    chips: asStringList(visual.chips, []).slice(0, 4),
    caption: asRich(visual.caption),
  };
}

function baseOf(raw: Record<string, unknown>) {
  return {
    eyebrow: asString(raw.eyebrow) || undefined,
    title: asString(raw.title) || undefined,
  };
}


/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

/* Every branch returns null when the section would render as an empty box,
   so a half-written section is dropped rather than shipped. */
function normalizeSection(raw: Record<string, unknown>): CardSection | null {
  const kind = asString(raw.kind).toLowerCase();
  const base = baseOf(raw);

  if (kind === "prose" || kind === "text") {
    const paras = Array.isArray(raw.paras)
      ? raw.paras.map((p) => asRich(p)).filter(Boolean)
      : [asRich(raw.body ?? raw.text)].filter(Boolean);
    if (!paras.length) return null;
    return { kind: "prose", ...base, paras };
  }

  if (kind === "dictionary") {
    const columns = asStringList(raw.columns, []).slice(0, 5);
    const rows = asObjectList(raw.rows)
      .slice(0, 10)
      .map((row) => ({
        cells: asStringList(row.cells, []).slice(0, columns.length || 5),
        note: asRich(row.note) || undefined,
      }))
      .filter((row) => row.cells.length);
    if (!columns.length || !rows.length) return null;
    const bridgeRaw = asObject(raw.bridge);
    const bridgeCol = asNumber(bridgeRaw.col);
    return {
      kind: "dictionary",
      ...base,
      columns,
      rows,
      readAcross: asRich(raw.readAcross) || undefined,
      bridge:
        bridgeCol !== undefined && bridgeCol >= 0 && bridgeCol < columns.length
          ? { col: Math.round(bridgeCol), label: asString(bridgeRaw.label, "bridge") }
          : undefined,
      caption: asRich(raw.caption) || undefined,
    };
  }

  if (kind === "derivation") {
    const steps = asObjectList(raw.steps)
      .slice(0, 8)
      .map((step) => ({
        latex: asString(step.latex) || undefined,
        body: asRich(step.body) || undefined,
        aside: asRich(step.aside) || undefined,
      }))
      .filter((step) => step.latex || step.body);
    if (!steps.length) return null;
    const resultRaw = asObject(raw.result);
    const resultLatex = asString(resultRaw.latex);
    const resultBody = asRich(resultRaw.body);
    return {
      kind: "derivation",
      ...base,
      premise: asRich(raw.premise) || undefined,
      steps,
      result:
        resultLatex || resultBody
          ? { latex: resultLatex || undefined, body: resultBody || undefined }
          : undefined,
      caption: asRich(raw.caption) || undefined,
    };
  }

  if (kind === "table") {
    const columns = asStringList(raw.columns, []).slice(0, 4);
    const rows = asObjectList(raw.rows)
      .slice(0, 10)
      .map((row) => ({
        label: asString(row.label) || undefined,
        cells: asStringList(row.cells, []).map((cell) => asRich(cell)),
        note: asRich(row.note) || undefined,
      }))
      .filter((row) => row.cells.length || row.label);
    if (!rows.length) return null;
    return {
      kind: "table",
      ...base,
      columns: columns.length ? columns : undefined,
      rows,
      caption: asRich(raw.caption) || undefined,
    };
  }

  if (kind === "callout") {
    const text = asRich(raw.text ?? raw.body);
    if (!text) return null;
    return {
      kind: "callout",
      ...base,
      tone: asEnum(raw.tone, ["trick", "warn", "insight"] as const, "insight"),
      text,
      detail: asRich(raw.detail) || undefined,
    };
  }

  if (kind === "examples" || kind === "ramp") {
    const items = normalizeExamples(raw.items ?? raw.examples);
    if (!items.length) return null;
    return {
      kind: "examples",
      ...base,
      intro: asRich(raw.intro) || undefined,
      items,
    };
  }

  if (kind === "moves") {
    const items = asObjectList(raw.items ?? raw.moves)
      .slice(0, 5)
      .map(normalizeMove)
      .filter((move) => move.body || move.formula);
    if (!items.length) return null;
    return {
      kind: "moves",
      ...base,
      intro: asRich(raw.intro) || undefined,
      items,
    };
  }

  if (kind === "figure" || kind === "visual") {
    const visual = normalizeVisual(raw.visual ?? raw);
    if (!visual) return null;
    return {
      kind: "figure",
      ...base,
      visual,
      intro: asRich(raw.intro ?? visual.intro) || undefined,
      chips: visual.chips?.length ? visual.chips : undefined,
      caption: asRich(raw.caption ?? visual.caption) || undefined,
    };
  }

  /* Unknown kind: drop the section rather than render an empty shell. */
  return null;
}

/* ------------------------------------------------------------------ */
/* Legacy adapter                                                      */
/*                                                                     */
/* Cards generated before the sections refactor have no `sections`, so  */
/* they are converted on read. Every legacy region has an honest        */
/* sections equivalent, which is why old records keep rendering without */
/* a second renderer to maintain.                                       */
/* ------------------------------------------------------------------ */

function legacySections(raw: CardSpec): CardSection[] {
  const out: CardSection[] = [];
  const formal = raw.formal;
  const ramp = raw.ramp;

  if (raw.visual && raw.visual.kind !== "none") {
    const visual = normalizeVisual(raw.visual);
    if (visual) {
      out.push({
        kind: "figure",
        title: visual.heading || undefined,
        visual,
        intro: visual.intro || undefined,
        chips: visual.chips?.length ? visual.chips : undefined,
        caption: visual.caption || undefined,
      });
    }
  }

  if (formal?.invariant?.headline) {
    out.push({
      kind: "callout",
      tone: "insight",
      eyebrow: formal.invariant.label || "THE INVARIANT",
      text: formal.invariant.headline,
    });
  }

  if (formal?.ledger?.latex) {
    out.push({
      kind: "derivation",
      eyebrow: "the governing equation",
      title: formal.heading || "The formal part",
      premise: formal.variablePart || undefined,
      steps: [{ latex: formal.ledger.latex, body: formal.ledger.note || undefined }],
    });
  }

  const moves = (formal?.moves ?? []).filter((move) => move.body || move.formula);
  if (moves.length) {
    out.push({ kind: "moves", eyebrow: "the moves", title: "The moves", items: moves });
  }

  if (formal?.trick?.body) {
    out.push({
      kind: "callout",
      tone: "trick",
      eyebrow: formal.trick.label || "THE TRICK",
      text: formal.trick.body,
    });
  }

  const checks = formal?.checks;
  if (checks?.items?.length) {
    out.push({
      kind: "table",
      title: checks.title || "Sanity checks",
      columns: ["Check", "What it tests"],
      rows: checks.items.map((item) => ({
        cells: [item.latex ? `$$${item.latex}$$` : "", asRich(item.note)],
      })),
      caption: checks.after ? asRich(checks.after) : undefined,
    });
  }

  if (formal?.scope?.body) {
    out.push({
      kind: "prose",
      title: formal.scope.title || "Where this applies",
      paras: [asRich(formal.scope.body)],
    });
  }

  if (ramp?.examples?.length) {
    out.push({
      kind: "examples",
      eyebrow: "practice ramp",
      title: ramp.heading || "Practice ramp",
      intro: ramp.intro ? asRich(ramp.intro) : undefined,
      items: ramp.examples,
    });
  }

  return out;
}

/* The single entry point the renderer uses: a card is always a list of
   sections, whether it was written yesterday or two migrations ago. */
export function sectionsOf(spec: CardSpec): CardSection[] {
  if (Array.isArray(spec.sections) && spec.sections.length) return spec.sections;
  return legacySections(spec);
}

/* ------------------------------------------------------------------ */
/* Top-level normalization                                             */
/* ------------------------------------------------------------------ */

export function normalizeCardSpec(raw: CardSpec, lesson: LessonPlan): CardSpec {
  const source = asObject(raw);
  const headingIn = Array.isArray(source.heading)
    ? source.heading.map((h) => asString(h))
    : [];
  const cta = asObject(source.cta);

  const sections = Array.isArray(source.sections)
    ? source.sections
        .map(asObject)
        .slice(0, 14)
        .map(normalizeSection)
        .filter((section): section is CardSection => section !== null)
    : [];

  /* A model that ignored the new shape and wrote the old one still gets a
     valid card: the legacy adapter converts its regions. */
  const chosen = sections.length ? sections : legacySections(raw);

  return {
    version: 2,
    title: asString(source.title, lesson.title),
    pathSub: asString(source.pathSub, lesson.subtitle),
    accent: asEnum(source.accent, ACCENTS, "pine"),
    heading: [asString(headingIn[0], lesson.title), asString(headingIn[1], "")],
    lead: asRich(source.lead, lesson.topic),
    metaNeutral: asStringList(source.metaNeutral, []).slice(0, 4),
    metaAccent: asString(source.metaAccent, "CARD"),
    sections:
      chosen.length > 0
        ? chosen
        : [{ kind: "prose", title: lesson.title, paras: [asRich(lesson.topic)] }],
    cta: {
      heading: asString(cta.heading, "You have the picture."),
      body: asRich(cta.body),
    },
    nextUp: asString(source.nextUp) || undefined,
  };
}
