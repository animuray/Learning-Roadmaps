"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { labSolves } from "@/db/schema";
import { getRoadmap, getTopic } from "@/lib/content";
import { canUseLab, checkTask, labConfig, standFor, startTask, terminalToken } from "@/lib/lab";
import { computeStates, getRoadmapProgress, logActivity, markStarted } from "@/lib/progress";
import { getCurrentUser } from "@/lib/session";

const topicSchema = z.object({
  roadmap: z.string().min(1).max(100),
  topic: z.string().min(1).max(100),
});
const taskSchema = topicSchema.extend({ taskKey: z.string().min(1).max(50) });

/** Общие проверки: пользователь, доступ к стендам, тема открыта, в ней есть лаборатория. */
async function loadLab(input: z.infer<typeof topicSchema>) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Нужно войти, чтобы работать в терминале");
  const config = labConfig();
  if (!config) throw new Error("Лаборатория на этом сервере не настроена");
  if (!canUseLab(user)) throw new Error("Терминал доступен только пользователям из списка LAB_ALLOWED_EMAILS");

  const roadmap = getRoadmap(input.roadmap);
  const topic = roadmap ? getTopic(input.roadmap, input.topic) : null;
  if (!roadmap || !topic?.lab) throw new Error("Лаборатория не найдена");
  const progress = await getRoadmapProgress(user.id, input.roadmap);
  if (computeStates(roadmap, progress).get(input.topic) === "locked") throw new Error("Тема ещё заблокирована");
  return { user, config, lab: topic.lab, stand: standFor(config, user) };
}

/** Адрес и одноразовый токен WebSocket-терминала. */
export async function getLabTerminal(input: z.infer<typeof topicSchema>): Promise<{ url: string; token: string }> {
  const { user, config } = await loadLab(topicSchema.parse(input));
  return { url: config.wsUrl, token: terminalToken(config, user) };
}

/** «Начать задачу»: подготовить стенд (setup от root). */
export async function startLabTask(input: z.infer<typeof taskSchema>): Promise<{ ok: boolean; output: string }> {
  const data = taskSchema.parse(input);
  const { lab, stand } = await loadLab(data);
  const task = lab.tasks.find((t) => t.key === data.taskKey);
  if (!task) throw new Error("Задача не найдена. Обновите страницу.");
  return startTask(stand, lab, task);
}

export type LabCheckResponse = {
  passed: boolean;
  output: string;
  notes: string[];
  /** Разбор эталона — только после решения. */
  reviewHtml: string | null;
  solvedCount: number;
  taskCount: number;
};

/** «Проверить»: скрипт проверки на стенде; при успехе задача записывается в профиль. */
export async function checkLabTask(input: z.infer<typeof taskSchema>): Promise<LabCheckResponse> {
  const data = taskSchema.parse(input);
  const { user, lab, stand } = await loadLab(data);
  const task = lab.tasks.find((t) => t.key === data.taskKey);
  if (!task) throw new Error("Задача не найдена. Обновите страницу.");

  const result = await checkTask(stand, lab, task);
  if (result.passed) {
    const inserted = await db
      .insert(labSolves)
      .values({ userId: user.id, roadmap: data.roadmap, topic: data.topic, taskKey: task.key })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) {
      await markStarted(user.id, data.roadmap, data.topic);
      await logActivity(user.id, "lab", { roadmap: data.roadmap, topic: data.topic });
    }
  }

  const rows = await db
    .select({ key: labSolves.taskKey })
    .from(labSolves)
    .where(and(eq(labSolves.userId, user.id), eq(labSolves.roadmap, data.roadmap), eq(labSolves.topic, data.topic)));
  const solved = new Set(rows.map((r) => r.key));

  return {
    ...result,
    reviewHtml: result.passed ? task.reviewHtml : null,
    solvedCount: lab.tasks.filter((t) => solved.has(t.key)).length,
    taskCount: lab.tasks.length,
  };
}
