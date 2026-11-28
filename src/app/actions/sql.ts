"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sqlSolves } from "@/db/schema";
import { getRoadmap, getTopic } from "@/lib/content";
import { matchNotes } from "@/lib/content/task-blocks";
import { computeStates, getRoadmapProgress, logActivity, markStarted } from "@/lib/progress";
import { getCurrentUser } from "@/lib/session";
import { runSqlTask, type SqlRunResult } from "@/lib/sql-practice";

const checkSchema = z.object({
  roadmap: z.string().min(1).max(100),
  topic: z.string().min(1).max(100),
  taskKey: z.string().min(1).max(50),
  sql: z.string().min(1).max(10_000),
});

export type SqlCheckResult = SqlRunResult & {
  /** Задача решена (проверка пройдена и записана в профиль). */
  solved: boolean;
  solvedCount: number;
  taskCount: number;
  /** Замечания по тексту запроса (правила из ```text notes). */
  notes: string[];
  /** Разбор эталона — только после решения. */
  reviewHtml: string | null;
};

/** Выполняет запрос в SQL-песочнице и, если он верный, отмечает задачу решённой. */
export async function checkSqlTask(input: z.infer<typeof checkSchema>): Promise<SqlCheckResult> {
  const data = checkSchema.parse(input);

  const user = await getCurrentUser();
  if (!user) throw new Error("Нужно войти, чтобы решать задачи");
  const roadmap = getRoadmap(data.roadmap);
  const topic = roadmap ? getTopic(data.roadmap, data.topic) : null;
  if (!roadmap || !topic) throw new Error("Тема не найдена");

  const progress = await getRoadmapProgress(user.id, data.roadmap);
  const state = computeStates(roadmap, progress).get(data.topic);
  if (state === "locked") throw new Error("Тема ещё заблокирована");

  const task = topic.tasks.find((t) => t.key === data.taskKey);
  if (!task) throw new Error("Задача не найдена. Обновите страницу.");

  const result = await runSqlTask(task, data.sql);

  let solved = false;
  if (result.passed) {
    const inserted = await db
      .insert(sqlSolves)
      .values({ userId: user.id, roadmap: data.roadmap, topic: data.topic, taskKey: task.key })
      .onConflictDoNothing()
      .returning();
    solved = true;
    if (inserted.length) {
      await markStarted(user.id, data.roadmap, data.topic);
      await logActivity(user.id, "sql", { roadmap: data.roadmap, topic: data.topic });
    }
  }

  const rows = await db
    .select({ key: sqlSolves.taskKey })
    .from(sqlSolves)
    .where(
      and(
        eq(sqlSolves.userId, user.id),
        eq(sqlSolves.roadmap, data.roadmap),
        eq(sqlSolves.topic, data.topic),
      ),
    );
  const solvedKeys = new Set(rows.map((r) => r.key));
  const solvedCount = topic.tasks.filter((t) => solvedKeys.has(t.key)).length;

  return {
    ...result,
    solved,
    solvedCount,
    taskCount: topic.tasks.length,
    notes: result.ok ? matchNotes(task.notes, data.sql) : [],
    reviewHtml: solved ? task.reviewHtml : null,
  };
}
