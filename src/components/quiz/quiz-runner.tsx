"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleX, RotateCcw, Trophy, X } from "lucide-react";
import { submitQuiz, type QuizSubmitResult } from "@/app/actions/learning";
import type { PublicQuestion } from "@/lib/content";

type Answer = { selected?: number[]; text?: string };

export function QuizRunner({
  roadmap,
  topic,
  questions,
  passScore,
  next,
  topicHref,
  roadmapHref,
}: {
  roadmap: string;
  topic: string;
  questions: PublicQuestion[];
  passScore: number;
  next: { title: string; href: string } | null;
  topicHref: string;
  roadmapHref: string;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const q = questions[idx];
  const isAnswered = (qq: PublicQuestion) => {
    const a = answers[qq.id];
    return qq.type === "text" ? !!a?.text?.trim() : !!a?.selected?.length;
  };
  const answeredCount = questions.filter(isAnswered).length;

  function setSelected(qq: PublicQuestion, optionId: number) {
    setAnswers((prev) => {
      const cur = prev[qq.id]?.selected ?? [];
      const selected =
        qq.type === "single" ? [optionId] : cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId];
      return { ...prev, [qq.id]: { selected } };
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await submitQuiz({
          roadmap,
          topic,
          answers: questions.map((qq) => ({ questionId: qq.id, ...answers[qq.id] })),
        });
        setResult(res);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось отправить ответы");
      }
    });
  }

  if (result) {
    return <Results result={result} questions={questions} answers={answers} passScore={passScore} next={next} topicHref={topicHref} roadmapHref={roadmapHref} onRetry={() => router.refresh()} />;
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-1.5">
        {questions.map((qq, i) => (
          <button
            key={qq.id}
            onClick={() => setIdx(i)}
            className={clsx(
              "size-8 rounded-lg border text-sm font-medium",
              i === idx ? "border-accent bg-accent text-white" : isAnswered(qq) ? "border-accent/40 bg-accent-soft" : "border-line bg-surface",
            )}
            aria-label={`Вопрос ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-surface p-5 md:p-7">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          Вопрос {idx + 1} из {questions.length}
          {q.type === "multiple" && " · несколько правильных ответов"}
          {q.type === "text" && " · введите ответ"}
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-snug" dangerouslySetInnerHTML={{ __html: q.titleHtml }} />
        {q.bodyHtml && <div className="prose-content mt-3" dangerouslySetInnerHTML={{ __html: q.bodyHtml }} />}

        {q.type === "text" ? (
          <input
            autoFocus
            value={answers[q.id]?.text ?? ""}
            onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: { text: e.target.value } }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && idx < questions.length - 1) setIdx(idx + 1);
            }}
            placeholder="Ваш ответ"
            className="mt-5 w-full rounded-xl border border-line bg-surface-2 px-4 py-3 font-mono"
          />
        ) : (
          <ul className="mt-5 space-y-2">
            {q.options.map((o) => {
              const on = answers[q.id]?.selected?.includes(o.id) ?? false;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(q, o.id)}
                    className={clsx(
                      "flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition",
                      on ? "border-accent bg-accent-soft" : "border-line hover:border-accent/40",
                    )}
                  >
                    <span
                      className={clsx(
                        "mt-0.5 grid size-5 shrink-0 place-items-center border-2",
                        q.type === "single" ? "rounded-full" : "rounded-md",
                        on ? "border-accent bg-accent text-white" : "border-muted/50",
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="prose-content" dangerouslySetInnerHTML={{ __html: o.html }} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          onClick={() => setIdx(Math.max(0, idx - 1))}
          disabled={idx === 0}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-40"
        >
          <ArrowLeft className="size-4" /> Назад
        </button>
        <span className="text-sm text-muted">
          Отвечено {answeredCount} из {questions.length}
        </span>
        {idx < questions.length - 1 ? (
          <button
            onClick={() => setIdx(idx + 1)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Далее <ArrowRight className="size-4" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-passed px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Проверяю…" : "Завершить тест"}
          </button>
        )}
      </div>
      {answeredCount < questions.length && idx === questions.length - 1 && (
        <p className="mt-2 text-right text-xs text-muted">Вопросы без ответа засчитываются как неверные.</p>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}

function Results({
  result,
  questions,
  answers,
  passScore,
  next,
  topicHref,
  roadmapHref,
  onRetry,
}: {
  result: QuizSubmitResult;
  questions: PublicQuestion[];
  answers: Record<string, Answer>;
  passScore: number;
  next: { title: string; href: string } | null;
  topicHref: string;
  roadmapHref: string;
  onRetry: () => void;
}) {
  const byId = new Map(result.results.map((r) => [r.questionId, r]));
  return (
    <div className="mt-6">
      <div
        className={clsx(
          "rounded-2xl border-2 p-6 text-center",
          result.passed ? "border-passed/50 bg-passed-soft" : "border-danger/30 bg-surface",
        )}
      >
        {result.passed ? <Trophy className="mx-auto size-10 text-passed" /> : <RotateCcw className="mx-auto size-10 text-muted" />}
        <div className="mt-2 text-4xl font-bold">{result.score}%</div>
        <div className="mt-1 text-muted">
          {result.correct} из {result.total} правильно · нужно {passScore}%
        </div>
        <p className="mt-3 font-medium">
          {result.passed
            ? result.newlyPassed
              ? "Тест сдан! Тема засчитана, следующая открыта."
              : "Тест сдан повторно — отличное закрепление."
            : "Пока не хватает. Перечитайте конспект и материалы — вопросы в следующей попытке будут перемешаны."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {result.passed && next && (
            <Link href={next.href} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 font-medium text-white hover:opacity-90">
              Следующая тема: {next.title} <ArrowRight className="size-4" />
            </Link>
          )}
          {!result.passed && (
            <Link href={topicHref} className="rounded-xl bg-accent px-4 py-2 font-medium text-white hover:opacity-90">
              Вернуться к конспекту
            </Link>
          )}
          <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-2 hover:bg-surface-2">
            <RotateCcw className="size-4" /> Пройти ещё раз
          </button>
          <Link href={roadmapHref} className="rounded-xl border border-line bg-surface px-4 py-2 hover:bg-surface-2">
            К карте роадмапа
          </Link>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Разбор</h2>
      {!result.passed && (
        <p className="mt-1 text-sm text-muted">Правильные ответы и пояснения откроются, когда вы сдадите тест.</p>
      )}
      <ol className="mt-3 space-y-3">
        {questions.map((q, i) => {
          const r = byId.get(q.id);
          const mine = answers[q.id];
          return (
            <li key={q.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start gap-2">
                {r?.correct ? (
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-passed" />
                ) : (
                  <CircleX className="mt-0.5 size-5 shrink-0 text-danger" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {i + 1}. <span dangerouslySetInnerHTML={{ __html: q.titleHtml }} />
                  </div>
                  {q.type === "text" ? (
                    <div className="mt-2 text-sm">
                      Ваш ответ: <code className="rounded bg-surface-2 px-1.5 py-0.5">{mine?.text || "—"}</code>
                      {r?.acceptedAnswers && (
                        <span className="ml-2 text-muted">
                          Верно: {r.acceptedAnswers.map((a) => <code key={a} className="mx-0.5 rounded bg-passed-soft px-1.5 py-0.5">{a}</code>)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {q.options.map((o) => {
                        const chosen = mine?.selected?.includes(o.id);
                        const isCorrect = r?.correctOptionIds?.includes(o.id);
                        if (!chosen && !isCorrect) return null;
                        return (
                          <li key={o.id} className="flex items-start gap-2">
                            {r?.correctOptionIds ? (
                              isCorrect ? <Check className="mt-0.5 size-4 shrink-0 text-passed" /> : <X className="mt-0.5 size-4 shrink-0 text-danger" />
                            ) : (
                              <span className="mt-0.5 text-muted">•</span>
                            )}
                            <span className={clsx(chosen && "font-medium")} dangerouslySetInnerHTML={{ __html: o.html }} />
                            {chosen && <span className="text-xs text-muted">(ваш ответ)</span>}
                          </li>
                        );
                      })}
                      {!mine?.selected?.length && <li className="text-muted">Нет ответа</li>}
                    </ul>
                  )}
                  {r?.explanationHtml && (
                    <div className="prose-content mt-3 rounded-lg bg-surface-2 p-3 text-sm" dangerouslySetInnerHTML={{ __html: r.explanationHtml }} />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
