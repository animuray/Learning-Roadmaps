"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Lightbulb, Play, RotateCcw, Wrench } from "lucide-react";
import { checkSqlTask, type SqlCheckResult } from "@/app/actions/sql";
import type { PublicSqlTask } from "@/lib/content";
import { Review, SolutionNotes } from "./solution-feedback";

type Drafts = Record<string, string>;

/**
 * Тренажёр SQL: список задач с редактором запроса.
 * Запрос выполняется на сервере в изолированной базе, результат сравнивается с эталоном.
 */
export function SqlTrainer({
  roadmap,
  topic,
  tasks,
  solved,
  disabled,
}: {
  roadmap: string;
  topic: string;
  tasks: PublicSqlTask[];
  solved: string[];
  disabled?: boolean;
}) {
  const [done, setDone] = useState<Set<string>>(() => new Set(solved));
  const [open, setOpen] = useState<string | null>(tasks[0]?.key ?? null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [results, setResults] = useState<Record<string, SqlCheckResult | null>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string | null>>({});
  const [visible, setVisible] = useState<Record<string, "hint" | "solution" | null>>({});
  const loaded = useRef(false);

  // Черновики запросов переживают обновление страницы.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const raw = localStorage.getItem(`sql-drafts:${roadmap}:${topic}`);
      if (raw) setDrafts(JSON.parse(raw) as Drafts);
    } catch {
      /* битый localStorage — просто начинаем с пустых черновиков */
    }
  }, [roadmap, topic]);

  function setDraft(key: string, sql: string) {
    setDrafts((prev) => {
      const next = { ...prev, [key]: sql };
      try {
        localStorage.setItem(`sql-drafts:${roadmap}:${topic}`, JSON.stringify(next));
      } catch {
        /* переполнение хранилища — не страшно */
      }
      return next;
    });
  }

  async function run(task: PublicSqlTask) {
    const sql = drafts[task.key] ?? "";
    setRunning(task.key);
    setError((e) => ({ ...e, [task.key]: null }));
    try {
      const res = await checkSqlTask({ roadmap, topic, taskKey: task.key, sql });
      setResults((r) => ({ ...r, [task.key]: res }));
      if (res.passed) setDone((d) => new Set(d).add(task.key));
    } catch (e) {
      setResults((r) => ({ ...r, [task.key]: null }));
      setError((err) => ({ ...err, [task.key]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setRunning(null);
    }
  }

  const count = tasks.filter((t) => done.has(t.key)).length;

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-muted">
          Решено {count} из {tasks.length}
        </span>
        <span className="text-xs text-muted">запрос выполняется в изолированной базе, изменения откатываются</span>
      </div>

      <ul className="space-y-3">
        {tasks.map((task, i) => {
          const isOpen = open === task.key;
          const isDone = done.has(task.key);
          const res = results[task.key];
          const err = error[task.key];
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

                  {task.seed && (
                    <details className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
                      <summary className="cursor-pointer select-none text-muted">Данные задачи (схема и строки)</summary>
                      <pre className="mt-2 overflow-x-auto text-xs leading-relaxed">
                        <code>{task.seed}</code>
                      </pre>
                    </details>
                  )}

                  {disabled ? (
                    <p className="mt-3 text-sm text-muted">
                      Войдите, чтобы решать задачи тренажёра — результат сохранится в вашем профиле.
                    </p>
                  ) : (
                    <>
                      <textarea
                        value={drafts[task.key] ?? ""}
                        onChange={(e) => setDraft(task.key, e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                            e.preventDefault();
                            void run(task);
                          }
                        }}
                        spellCheck={false}
                        rows={5}
                        placeholder="SELECT ..."
                        className="mt-3 w-full resize-y rounded-lg border border-line bg-surface-2 p-3 font-mono text-sm outline-none focus:border-accent"
                      />

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void run(task)}
                          disabled={running === task.key}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                        >
                          <Play className="size-3.5" />
                          {running === task.key ? "Выполняется…" : "Проверить"}
                        </button>
                        <span className="text-xs text-muted">Ctrl+Enter</span>
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
                        <button
                          type="button"
                          onClick={() => setDraft(task.key, "")}
                          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:bg-surface-2"
                        >
                          <RotateCcw className="size-3.5" /> Очистить
                        </button>
                      </div>

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

                      {err && (
                        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
                          <div className="font-medium">Ошибка</div>
                          <pre className="mt-1 whitespace-pre-wrap text-xs">{err}</pre>
                        </div>
                      )}

                      {res && res.ok && (
                        <div
                          className={clsx(
                            "mt-3 rounded-lg border p-3",
                            res.passed ? "border-passed/40 bg-passed-soft" : "border-line bg-surface-2",
                          )}
                        >
                          <div className={clsx("text-sm font-medium", res.passed ? "text-passed" : "text-fg")}>
                            {resultMessage(res)}
                          </div>
                          <SqlDataReaderTable columns={res.columns} rows={res.rows} />
                          {res.notes.length > 0 && <SolutionNotes notes={res.notes} />}
                          {res.reviewHtml && <Review html={res.reviewHtml} />}
                        </div>
                      )}
                    </>
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

function resultMessage(res: SqlCheckResult): string {
  if (res.kind === "state") {
    return res.passed
      ? "Верно! Данные в таблицах изменились так, как нужно."
      : "Данные в таблицах изменились не так, как требует условие задачи.";
  }
  return res.passed
    ? "Верно! Результат совпал с эталоном."
    : "Результат не совпал с эталоном: отличаются строки, столбцы или их порядок.";
}

function SqlDataReaderTable({ columns, rows }: { columns: string[]; rows: (string | null)[][] }) {
  if (!rows.length) return <div className="mt-2 text-sm text-muted">Запрос выполнен, строк нет.</div>;
  return (
    <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface-2 text-left text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-2 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-line">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1.5 font-mono">
                  {cell === null ? <span className="text-muted">NULL</span> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
