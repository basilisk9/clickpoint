import { CORRECT_ANSWER_XP, QUIZ_PASS_THRESHOLD } from "./constants";
import type { QuizNumericQuestion, QuizPayload, QuizQuestion } from "./types";

function parseNumericInput(value: string) {
  const cleaned = value
    .trim()
    .replace(/,/g, "")
    .replace(/×10\^/gi, "e")
    .replace(/x10\^/gi, "e");
  const match = cleaned.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function numericTolerance(question: QuizNumericQuestion) {
  if (typeof question.tolerance === "number") return question.tolerance;
  const mag = Math.abs(question.answer);
  return Math.max(mag * 0.01, 0.01);
}

export function gradeAnswer(question: QuizQuestion, value: string): boolean {
  if (question.type === "mcq") {
    const idx = Number(value);
    return Number.isInteger(idx) && idx === question.correctIndex;
  }
  const n = parseNumericInput(value);
  if (n === null) return false;
  return Math.abs(n - question.answer) <= numericTolerance(question);
}

export function gradeQuiz(quiz: QuizPayload, answers: Record<string, string>) {
  const results = quiz.questions.map((question) => {
    const submitted = answers[question.id] ?? "";
    const correct = gradeAnswer(question, submitted);
    return { id: question.id, correct, submitted };
  });
  const correctCount = results.filter((row) => row.correct).length;
  const total = quiz.questions.length;
  const passed = total > 0 && correctCount / total >= QUIZ_PASS_THRESHOLD;
  const xp = correctCount * CORRECT_ANSWER_XP;
  return { results, correctCount, total, passed, xp };
}

/* ------------------------------------------------------------------ */
/* Single-question grading.                                            */
/*                                                                     */
/* The card-by-card quiz UI checks one answer at a time, so it needs a */
/* per-question verdict plus the explanation to show immediately.      */
/* Grading stays here (server-side) rather than in the browser so the  */
/* correct answer is never shipped to the client and hearts cannot be  */
/* forged. `reveal` carries only what the UI is allowed to display     */
/* after the student has already committed to an answer.               */
/* ------------------------------------------------------------------ */

export type QuestionVerdict = {
  questionId: string;
  correct: boolean;
  /* Present only after grading — safe to send because the student has
     already answered, so it cannot be used to cheat the question. */
  reveal: {
    explanation: string;
    /* For numeric questions we show the expected value on a miss. */
    expected?: number;
    unit?: string;
    /* For mcq we mark the right choice on a miss. */
    correctIndex?: number;
  };
};

export function gradeQuestion(
  quiz: QuizPayload,
  questionId: string,
  answer: string,
): QuestionVerdict | null {
  const question = quiz.questions.find((item) => item.id === questionId);
  if (!question) return null;

  const correct = gradeAnswer(question, answer);
  const reveal: QuestionVerdict["reveal"] = { explanation: question.explanation };

  if (!correct) {
    if (question.type === "numeric") {
      reveal.expected = question.answer;
      reveal.unit = question.unit;
    } else {
      reveal.correctIndex = question.correctIndex;
    }
  }

  return { questionId, correct, reveal };
}

/* Counts a quiz's questions so the client can render the progress bar
   without receiving the answers. */
export function quizShape(quiz: QuizPayload) {
  return quiz.questions.map((question) => ({
    id: question.id,
    type: question.type,
    tag: question.tag ?? "",
  }));
}

