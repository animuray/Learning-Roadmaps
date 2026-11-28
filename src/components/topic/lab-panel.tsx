"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Flag, Lightbulb, Play, Wrench } from "lucide-react";
import { checkLabTask, startLabTask, type LabCheckResponse } from "@/app/actions/lab";
import type { PublicLabTask } from "@/lib/content";
import { LabTerminal } from "./lab-terminal";
import { Review, SolutionNotes } from "./solution-feedback";

/**
 * Лаборатория: терминал стенда и список задач. «Начать задачу» готовит стенд,
 * «Проверить» запускает скрипт проверки — он смотрит на результат, а не на команды,
 * поэтому засчитывается любое рабочее решение. Замечания и разбор объясняют,
 * чем решение отличается от принятого на практике.
 */
export function LabPanel({
  roadmap,
  topic,
  tasks,
  solved,
  disabled,
  unavailable,
}: {
  roadmap: string;
  topic: string;
  tasks: PublicLabTask[];
  solved: string[];
  disabled?: boolean;
  /** Причина, по которой терминал недоступен (не настроен, нет доступа). */
  unavailable?: string | null;
}) {
  const [done, setDone] = useState<Set<string>>(() => new Set(solved));
  const [open, setOpen] = useState<string | null>(tasks.find((t) => !solved.includes(t.key))?.key ?? tasks[0]?.key);
  const [busy, setBusy] = useState<string | null>(null);
  const [started, setStarted] = useState<Record<string, { ok: boolean; output: string } | undefined>>({});
  const [results, setResults] = useState<Record<string, LabCheckResponse | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [visible, setVisible] = useState<Record<string, "hint" | "solution" | null>>({});

  async function run(task: PublicLabTask, action: "start" | "check") {
    setBusy(`${action}:${task.key}`);
    setErrors((e) => ({ ...e, [task.key]: undefined }));
    try {
      const input = { roadmap, topic, taskKey: task.key };
      if (action === "start") {
        const r = await startLabTask(input);
        setStarted((s) => ({ ...s, [task.key]: r }));
        setResults((s) => ({ ...s, [task.key]: undefined }));
      } else {
        const r = await checkLabTask(input);
        setResults((s) => ({ ...s, [task.key]: r }));
        if (r.passed) setDone((d) => new Set(d).add(task.key));
      }
    } catch (e) {
      setErrors((s) => ({ ...s, [task.key]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
    }
  }

  const blocked = disabled || !!unavailable;
  const count = tasks.filter((t) => done.has(t.key)).length;

  return (
    <div>
      {unavailable ? (
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4 text-sm text-muted">{unavailable}</div>
      ) : (
        <LabTerminal roadmap={roadmap} topic={topic} disabled={disabled} />
      )}

      <div className="mb-3 mt-5 flex items-center justify-between text-sm">
        <span className="text-muted">
          Решено {count} из {tasks.length}
        </span>
        <span className="text-xs text-muted">проверяется результат, а не конкретные команды</span>
      </div>

      <ul className="space-y-3">
        {tasks.map((task, i) => {
          const isOpen = open === task.key;
          const isDone = done.has(task.key);
          const res = results[task.key];
          const st = started[task.key];
          const err = errors[task.key];
          const show = visible[task.key];
          return (
            <li key={task.key} className="rounded-xl border border-line bg-surface">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : task.key)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className={clsx(
                    "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    isDone ? "bg-passed text-white" : "bg-accent-soft text-accent",
                  )}
                >
                  {isDone ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">{task.title}</span>
                {isDone && <span className="text-xs text-passed">решено</span>}
                <ChevronDown className={clsx("size-4 text-muted transition", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="border-t border-line px-4 pb-4 pt-3">
                  {task.conditionHtml && (
                    <div className="prose-content text-sm" dangerouslySetInnerHTML={{ __html: task.conditionHtml }} />
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={blocked || !!busy}
                      onClick={() => void run(task, "start")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
                    >
                      <Flag className="size-3.5" />
                      {busy === `start:${task.key}` ? "Готовлю стенд…" : "Начать задачу"}
                    </button>
                    <button
                      type="button"
                      disabled={blocked || !!busy}
                      onClick={() => void run(task, "check")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <Play className="size-3.5" />
                      {busy === `check:${task.key}` ? "Проверяю…" : "Проверить"}
                    </button>
                    {task.hint && (
                      <button
                        type="button"
                        onClick={() => setVisible((v) => ({ ...v, [task.key]: show === "hint" ? null : "hint" }))}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2"
                      >
                        <Lightbulb className="size-3.5" /> Подсказка
                      </button>
                    )}
                    {task.solution && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisible((v) => ({ ...v, [task.key]: show === "solution" ? null : "solution" }))
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2"
                      >
                        <Wrench className="size-3.5" /> Решение
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    «Начать задачу» приводит стенд в исходное состояние для этой задачи. Затем выполните команды в
                    терминале и нажмите «Проверить».
                  </p>

                  {show === "hint" && task.hint && (
                    <div className="mt-3 whitespace-pre-wrap rounded-lg border border-accent/40 bg-accent-soft p-3 text-sm">
                      {task.hint}
                    </div>
                  )}
                  {show === "solution" && task.solution && (
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs leading-relaxed">
                      <code>{task.solution}</code>
                    </pre>
                  )}

                  {st && (
                    <div
                      className={clsx(
                        "mt-3 rounded-lg border p-3 text-sm",
                        st.ok ? "border-line bg-surface-2" : "border-red-500/40 bg-red-500/10 text-red-400",
                      )}
                    >
                      {st.ok ? "Стенд готов к задаче — работайте в терминале." : "Не удалось подготовить стенд."}
                      {st.output && <pre className="mt-2 whitespace-pre-wrap text-xs">{st.output}</pre>}
                    </div>
                  )}

                  {err && (
                    <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{err}</div>
                  )}

                  {res && (
                    <div
                      className={clsx(
                        "mt-3 rounded-lg border p-3",
                        res.passed ? "border-passed/40 bg-passed-soft" : "border-line bg-surface-2",
                      )}
                    >
                      <div className={clsx("text-sm font-medium", res.passed ? "text-passed" : "text-fg")}>
                        {res.passed ? "Задача решена!" : "Пока не получилось."}
                      </div>
                      {res.output && <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{res.output}</pre>}
                      {res.notes.length > 0 && <SolutionNotes notes={res.notes} />}
                      {res.reviewHtml && <Review html={res.reviewHtml} />}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
