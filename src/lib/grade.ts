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
