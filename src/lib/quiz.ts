import type { PublicQuestion, Question, Topic } from "@/lib/content";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Случайная выборка вопросов для попытки: варианты перемешаны, правильные ответы вырезаны. */
export function buildAttempt(topic: Topic): { token: string; questions: PublicQuestion[] } {
  const size = topic.quizSize || topic.quiz.length;
  const questions = shuffle(topic.quiz)
    .slice(0, size)
    .map((q) => ({
      id: q.id,
      type: q.type,
      titleHtml: q.titleHtml,
      bodyHtml: q.bodyHtml,
      options: shuffle(q.options).map((o) => ({ id: o.id, html: o.html })),
    }));
  // Токен нужен, чтобы после «Пройти ещё раз» компонент теста пересоздался с новой выборкой.
  return { token: crypto.randomUUID(), questions };
}

export type SubmittedAnswer = { questionId: string; selected?: number[]; text?: string };

export type QuestionResult = {
  questionId: string;
  correct: boolean;
  /** Показываем только при успешной сдаче, чтобы тест нельзя было пересдать «по подсказкам». */
  correctOptionIds?: number[];
  acceptedAnswers?: string[];
  explanationHtml?: string;
};

export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[`"'«»]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(.)\/+$/, "$1");
}

export function gradeQuestion(q: Question, a: SubmittedAnswer | undefined): boolean {
  if (!a) return false;
  if (q.type === "text") {
    const given = normalizeAnswer(a.text ?? "");
    return !!given && q.answers.some((ans) => normalizeAnswer(ans) === given);
  }
  const correct = q.options.filter((o) => o.correct).map((o) => o.id).sort();
  const selected = [...new Set(a.selected ?? [])].sort();
  return correct.length === selected.length && correct.every((id, i) => id === selected[i]);
}
