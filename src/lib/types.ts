export type NodeKind = "card" | "quiz";
export type NodeStatus = "locked" | "available" | "complete" | "generating" | "failed";
export type PathwayStatus = "generating" | "ready" | "failed";
export type QuestionType = "mcq" | "numeric";

export type Compression = {
  from: number;
  to: number;
};

export type LessonPlan = {
  id: string;
  title: string;
  subtitle: string;
  topic: string;
  compression?: Compression;
};

export type PathwayOutline = {
  lessonCount: number;
  subject: string;
  unitLabel: string;
  sourceTag: string;
  lessons: LessonPlan[];
};

export type PathwayBanner = {
  title: string;
  kicker: string;
  blurb: string;
  stats: string[];
  floating: string[];
  bannerSvg: string;
  bannerCaption: string;
};

export type QuizChoiceQuestion = {
  id: string;
  type: "mcq";
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  /* Short label shown as a colored pill above the prompt (e.g. "Compute").
     Optional so older records without tags still render. */
  tag?: string;
};

export type QuizNumericQuestion = {
  id: string;
  type: "numeric";
  prompt: string;
  answer: number;
  unit?: string;
  tolerance?: number;
  explanation: string;
  tag?: string;
};

export type QuizQuestion = QuizChoiceQuestion | QuizNumericQuestion;

export type QuizPayload = {
  questions: QuizQuestion[];
};

export type PathwayNode = {
  id: string;
  kind: NodeKind;
  lessonIndex: number;
  title: string;
  subtitle: string;
  status: NodeStatus;
  /* Typed card content — the current format. */
  card?: CardSpec;
  /* Legacy field: pre-migration records stored a full HTML document here.
     Kept so existing data/ JSON still parses and renders. */
  html?: string;
  quiz?: QuizPayload;
  error?: string;
};

export type PathwayRecord = {
  id: string;
  guestId: string;
  createdAt: string;
  updatedAt: string;
  status: PathwayStatus;
  rawNotes: string;
  outline: PathwayOutline;
  banner: PathwayBanner;
  nodes: PathwayNode[];
  xp: number;
  completedNodeIds: string[];
  gradedNodeIds?: string[];
  error?: string;
};

export type PathwaySummary = {
  id: string;
  title: string;
  blurb: string;
  createdAt: string;
  status: PathwayStatus;
  completedNodes: number;
  totalNodes: number;
  xp: number;
};

export type GuestRecord = {
  id: string;
  createdAt: string;
  pathwayIds: string[];
};

/* ------------------------------------------------------------------ */
/* Card content — typed data, never HTML.                              */
/*                                                                     */
/* The model supplies CONTENT ONLY: prose, formulas, examples. The     */
/* renderer (CardRenderer.tsx) supplies every pixel of styling, so all */
/* cards share one design system and one accent palette. This is what  */
/* makes cards consistent and removes the HTML-in-JSON escaping class  */
/* of failures entirely.                                               */
/*                                                                     */
/* Prose fields are "richtext": plain text with                        */
/*   $...$  inline LaTeX · $$...$$ display LaTeX                       */
/*   **bold** · *italic*                                               */
/* ------------------------------------------------------------------ */

export type CardAccent = "pine" | "blood" | "cobalt" | "ember" | "gold";
export type CardLevel = "warm" | "firm" | "brutal" | "transfer";

/* The model PICKS a visual from this fixed set; it never invents one.
   New visual kinds are added as React components, not as generated code. */
export type CardVisualKind = "landscape" | "bars" | "area" | "none";

export type CardMove = {
  name: string;
  trigger: string;
  formula: string; // LaTeX, rendered display
  body: string; // richtext
  check: string; // richtext
};

export type CardExample = {
  level: CardLevel;
  source: string;
  title: string;
  prompt: string; // richtext
  steps: string[]; // richtext, revealed one at a time
  takeaway: string; // richtext
};

export type CardSpec = {
  title: string;
  pathSub: string;
  accent: CardAccent;
  heading: [string, string];
  lead: string; // richtext
  metaNeutral: string[];
  metaAccent: string;
  visual: {
    kind: CardVisualKind;
    heading: string;
    intro: string; // richtext
    chips: string[];
    caption: string; // richtext
  };
  formal: {
    heading: string;
    invariant: { label: string; headline: string };
    ledger: { latex: string; note: string };
    variablePart: string; // richtext
    moves: CardMove[];
    trick: { label: string; body: string };
    checks: {
      title: string;
      items: { latex: string; note: string }[];
      after?: string;
    };
    scope: { title: string; body: string };
  };
  ramp: { heading: string; intro: string; examples: CardExample[] };
  cta: { heading: string; body: string };
};
