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
  /* Rolling 24h rate limit: when this guest last *started* a generation.
     Optional so pre-existing records without it still parse. */
  lastPathwayAt?: string;
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
export type CardLevel = "breeze" | "warm" | "firm" | "brutal" | "transfer";

/* The model PICKS a visual from this fixed set; it never invents one.
   New visual kinds are added as React components, not as generated code. */
export type CardVisualKind =
  | "landscape"
  | "bars"
  | "area"
  | "disk"
  | "vector"
  | "plot"
  | "oscillation"
  | "none";

/* ------------------------------------------------------------------ */
/* Sections — the card is an ordered list of these, not a template.     */
/*                                                                     */
/* A card used to be one fixed skeleton (invariant → ledger → moves →  */
/* trick → checks → ramp), which forced every concept through the same */
/* six regions. A dictionary-style card needs a table read across; a   */
/* derivation-heavy card needs a second derivation; neither fits.      */
/*                                                                     */
/* So the model now chooses WHICH sections exist and in WHAT ORDER. It */
/* still cannot choose how anything looks: `kind` selects a renderer,  */
/* and every pixel inside it belongs to the design system. That keeps  */
/* the consistency and the "no model-authored markup" property.        */
/* ------------------------------------------------------------------ */

export type CardSectionBase = {
  /* Short kicker above the section title, e.g. "THE THIRD DOOR". */
  eyebrow?: string;
  title?: string;
};

export type CardProseSection = CardSectionBase & {
  kind: "prose";
  paras: string[]; // richtext paragraphs
};

/* A table the learner reads ACROSS: each row is one concept (say, a    */
/* linear quantity) paired with its rotated twin. Some cells are bare  */
/* LaTeX, some are prose, and one is picked out as the bridge.         */
export type CardDictionarySection = CardSectionBase & {
  kind: "dictionary";
  columns: string[];
  rows: { cells: string[]; note?: string }[];
  readAcross?: string; // richtext: how to read the grid
  bridge?: { col: number; label: string }; // column that is the transfer rule
  caption?: string; // richtext
};

export type CardDerivationSection = CardSectionBase & {
  kind: "derivation";
  premise?: string; // richtext: what we assume going in
  steps: {
    latex?: string;
    body?: string; // richtext
    aside?: string; // richtext, the "why this step" remark
  }[];
  result?: { latex?: string; body?: string }; // richtext/LaTeX close
  caption?: string; // richtext
};

/* Free-form grid: either `columns` + `rows` (a table the learner reads  */
/* down) or just `rows` (a labelled definition list).                  */
export type CardTableSection = CardSectionBase & {
  kind: "table";
  columns?: string[];
  rows: { label?: string; cells: string[]; note?: string }[];
  caption?: string; // richtext
};

export type CardCalloutSection = CardSectionBase & {
  kind: "callout";
  tone?: "trick" | "warn" | "insight";
  text: string; // richtext, the headline rule
  detail?: string; // richtext
};

/* The ramp. One example per level, ordered easiest first. A `source`  */
/* is expected on every example: it is what stops the model inventing  */
/* problems that do not exist in the notes.                            */
export type CardExamplesSection = CardSectionBase & {
  kind: "examples";
  intro?: string; // richtext
  items: CardExample[];
};

export type CardMovesSection = CardSectionBase & {
  kind: "moves";
  intro?: string; // richtext
  items: CardMove[];
};

export type CardFigureSection = CardSectionBase & {
  kind: "figure";
  visual: CardVisual;
  intro?: string; // richtext
  chips?: string[];
  caption?: string; // richtext
};

export type CardSection =
  | CardProseSection
  | CardDictionarySection
  | CardDerivationSection
  | CardTableSection
  | CardCalloutSection
  | CardExamplesSection
  | CardMovesSection
  | CardFigureSection;

/* A visual is a registered interactive scene plus the wording around it.
   `none` means the model judged that no figure illuminates this idea. */
export type CardVisual = {
  kind: CardVisualKind;
  /* Optional registered scene id (see scenes.ts). Unknown ids fall back to
     the scene family of `kind`, so a stale id never breaks a card. */
  scene?: string;
  /* Optional seed values for the scene (e.g. { radius: 0.4, omega: 2 }).
     Scenes clamp whatever they receive, so a wild number cannot break one. */
  params?: Record<string, number>;
  heading?: string;
  intro?: string; // richtext
  chips?: string[];
  caption?: string; // richtext
};

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
  /* Bumped when the shape changes. 2 = sections-based card. */
  version?: number;
  title: string;
  pathSub: string;
  accent: CardAccent;
  heading: [string, string];
  lead: string; // richtext
  metaNeutral: string[];
  metaAccent: string;

  /* The card. The model picks which sections exist and in what order. */
  sections: CardSection[];

  cta: { heading: string; body: string };

  /* What the learner should open next, e.g. the next lesson's title. */
  nextUp?: string;

  /* LEGACY (pre-sections cards). Still present on records generated before
     version 2, and still rendered by CardRenderer through a read-only
     adapter, so no old card breaks. New cards never fill these in. */
  visual?: CardVisual;
  formal?: {
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
  ramp?: { heading: string; intro: string; examples: CardExample[] };
};
