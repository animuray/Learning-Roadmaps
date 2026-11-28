import type { Metadata } from "next";
import Link from "next/link";
import { Repeat } from "lucide-react";
import { toPublicQuestion } from "@/lib/quiz";
import { getDueItems, getReviewSummary, INTERVAL_DAYS } from "@/lib/review";
import { requireUser } from "@/lib/session";
import { QuizRunner } from "@/components/quiz/quiz-runner";

export const metadata: Metadata = { title: "Повторение" };

export default async function ReviewPage() {
  const user = await requireUser("/review");
  const items = await getDueItems(user.id);
  const summary = await getReviewSummary(user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold md:text-3xl">Повторение</h1>
      <p className="mt-1 text-sm text-muted">
        Вопросы, на которые вы ошиблись в тестах. Каждый возвращается через {INTERVAL_DAYS.join(", ")} дней — после
        стольких верных ответов подряд он считается выученным. Ошибка начинает серию заново.
      </p>

      {items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-8 text-center">
          <Repeat className="mx-auto size-10 text-muted" />
          <p className="mt-3 font-medium">Сейчас повторять нечего</p>
          <p className="mt-1 text-sm text-muted">
            {summary.total > 0 && summary.nextDue
              ? `В очереди ${summary.total} — следующий вопрос вернётся ${summary.nextDue.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}.`
              : "Ошибки из тестов будут появляться здесь на следующий день."}
          </p>
          <Link href="/roadmaps" className="mt-5 inline-block rounded-xl bg-accent px-4 py-2 font-medium text-white hover:opacity-90">
            К роадмапам
          </Link>
        </div>
      ) : (
        <QuizRunner
          key={items.map((i) => i.questionId).join()}
          questions={items.map((i) => toPublicQuestion(i.question))}
          target={{ kind: "review", topicTitles: Object.fromEntries(items.map((i) => [i.questionId, i.topicTitle])) }}
        />
      )}
    </div>
  );
}
