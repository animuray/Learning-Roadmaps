import "server-only";
import { and, asc, count, eq, lte, min, sql } from "drizzle-orm";
import { db } from "@/db";
import { reviewItems } from "@/db/schema";
import { getRoadmap, getTopic, type Question } from "@/lib/content";

/**
 * Через сколько дней вопрос вернётся после очередного верного ответа на повторении.
 * Ответил верно столько раз подряд, сколько здесь интервалов, — вопрос выучен и уходит из повторения.
 */
export const INTERVAL_DAYS = [1, 3, 7, 16, 35];

const DAY = 86_400_000;

/** Ошибка в тесте или на повторении: вопрос вернётся завтра, серия верных ответов начинается заново. */
export async function scheduleMistakes(userId: string, roadmap: string, topic: string, questionIds: string[]) {
  if (questionIds.length === 0) return;
  const dueAt = new Date(Date.now() + INTERVAL_DAYS[0] * DAY);
  await db
    .insert(reviewItems)
    .values(questionIds.map((questionId) => ({ userId, roadmap, topic, questionId, dueAt })))
    .onConflictDoUpdate({
      target: [reviewItems.userId, reviewItems.roadmap, reviewItems.topic, reviewItems.questionId],
      set: { box: 0, dueAt, lapses: sql`${reviewItems.lapses} + 1`, updatedAt: new Date() },
    });
}

/** Верный ответ на повторении: следующий интервал длиннее. Возвращает, через сколько дней вопрос вернётся (null — выучен). */
export async function schedulePass(userId: string, item: ReviewKey, box: number): Promise<number | null> {
  const next = box + 1;
  const where = and(
    eq(reviewItems.userId, userId),
    eq(reviewItems.roadmap, item.roadmap),
    eq(reviewItems.topic, item.topic),
    eq(reviewItems.questionId, item.questionId),
  );
  if (next >= INTERVAL_DAYS.length) {
    await db.delete(reviewItems).where(where);
    return null;
  }
  const days = INTERVAL_DAYS[next];
  await db
    .update(reviewItems)
    .set({ box: next, dueAt: new Date(Date.now() + days * DAY), updatedAt: new Date() })
    .where(where);
  return days;
}

export type ReviewKey = { roadmap: string; topic: string; questionId: string };

export type DueItem = ReviewKey & { box: number; question: Question; topicTitle: string };

/** Вопросы, которые пора повторить. Вопросы, которых больше нет в контенте (тему переписали), удаляются. */
export async function getDueItems(userId: string, limit = 15): Promise<DueItem[]> {
  const rows = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), lte(reviewItems.dueAt, new Date())))
    .orderBy(asc(reviewItems.dueAt))
    .limit(limit * 2);
  const items: DueItem[] = [];
  for (const r of rows) {
    const topic = getTopic(r.roadmap, r.topic);
    const question = topic?.quiz.find((q) => q.id === r.questionId);
    if (!topic || !question) {
      await db
        .delete(reviewItems)
        .where(
          and(
            eq(reviewItems.userId, userId),
            eq(reviewItems.roadmap, r.roadmap),
            eq(reviewItems.topic, r.topic),
            eq(reviewItems.questionId, r.questionId),
          ),
        );
      continue;
    }
    const roadmapTitle = getRoadmap(r.roadmap)?.title;
    items.push({
      roadmap: r.roadmap,
      topic: r.topic,
      questionId: r.questionId,
      box: r.box,
      question,
      topicTitle: roadmapTitle ? `${topic.title} · ${roadmapTitle}` : topic.title,
    });
    if (items.length >= limit) break;
  }
  return items;
}

export async function getReviewSummary(userId: string) {
  const [row] = await db
    .select({
      total: count(),
      // время — из приложения, как и при записи dueAt: у now() базы может быть другой часовой пояс
      due: sql<number>`count(*) filter (where ${reviewItems.dueAt} <= ${new Date().toISOString()}::timestamp)`.mapWith(Number),
      nextDue: min(reviewItems.dueAt),
    })
    .from(reviewItems)
    .where(eq(reviewItems.userId, userId));
  return { total: row?.total ?? 0, due: row?.due ?? 0, nextDue: row?.nextDue ?? null };
}
