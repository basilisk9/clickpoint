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
  /* The generated card: a full HTML body fragment (macro classes +
     model CSS + markup + JS), plus its declared reveal. Rendered
     verbatim in a sandboxed iframe with the host fonts, KaTeX, and
     macro stylesheet injected ahead of the model's own CSS. */
  card?: HtmlCard;
  quiz?: QuizPayload;
  error?: string;
};

/* ------------------------------------------------------------------ */
/* The card — one shot, one artifact.                                  */
/*                                                                     */
/* A card used to be a normalized CardSpec the renderer unfurled. A    */
/* card is now what the model wrote: an HTML body fragment plus the    */
/* reveal the model declared *before* writing it. There is            */
/* deliberately no structure to normalize — the iframe renders what   */
/* was written, and verification judges errors only (does it run),    */
/* never content.                                                     */
/*                                                                     */
/* reveal is generation metadata: the quiz call reads it so the        */
/* checkpoint can test the card's own click, and feedback triage      */
/* reads it to tell a no-reveal card (generation problem) from a      */
/* declared-but-undelivered one (prompt problem).                      */
/* ------------------------------------------------------------------ */

export type CardReveal = {
  /* The belief a traditionally-taught learner still holds that this
     card breaks. */
  misconception: string;
  /* The control in the card's visual that flips it. */
  knob: string;
};

export type CardAccent = "pine" | "blood" | "cobalt" | "ember" | "gold";

export type HtmlCard = {
  title: string;
  reveal: CardReveal;
  /* The body fragment: <style> with the model's own CSS, markup in the
     host's macro vocabulary, and an optional <script>. */
  html: string;
  accent: CardAccent;
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
  /* The quota is NOT here. It is one row per start in the pathway_starts
     table, because "N per rolling window" is a count, not a timestamp — and
     because appending rows cannot race the way a read-modify-write of this
     record can. listPathwayStarts() is the read side. */
};

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/*                                                                     */
/* What a learner can say is wrong. `kind` narrows the report so the    */
/* useful ones ("the quiz answer is wrong") can be told apart from the  */
/* general ones without reading every body.                             */
/* ------------------------------------------------------------------ */

export type FeedbackKind = "bug" | "card" | "quiz" | "idea" | "general";

export type FeedbackInput = {
  kind: FeedbackKind;
  body: string;
  /* Set when the report is anchored to a node, which is what makes it
     checkable against the generated content. */
  pathwayId?: string;
  nodeId?: string;
  pageUrl?: string;
};

