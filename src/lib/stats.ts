import "server-only";
import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { activities, practiceChecks, quizAttempts, topicProgress, userMaterials } from "@/db/schema";
import { startOfUtcDay } from "./progress";

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Сумма «очков активности» по дням (UTC) за последний год. */
export async function getActivityByDay(userId: string, days = 371): Promise<Map<string, number>> {
  const since = startOfUtcDay(new Date(Date.now() - days * 86_400_000));
  const day = sql<string>`to_char(${activities.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, value: sum(activities.amount).mapWith(Number) })
    .from(activities)
    .where(and(eq(activities.userId, userId), gte(activities.createdAt, since)))
    .groupBy(day);
  return new Map(rows.map((r) => [r.day, r.value]));
}

/** Текущая и максимальная серия дней подряд с любой активностью. */
export async function getStreaks(userId: string) {
  const day = sql<string>`to_char(${activities.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const rows = await db
    .selectDistinct({ day })
    .from(activities)
    .where(eq(activities.userId, userId))
    .orderBy(day);
  const days = rows.map((r) => r.day);
  let max = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    const t = Date.parse(d + "T00:00:00Z");
    run = prev !== null && t - prev === 86_400_000 ? run + 1 : 1;
    max = Math.max(max, run);
    prev = t;
  }
  // Текущая серия жива, если активность была сегодня или вчера (UTC).
  const today = Date.parse(dayKey(new Date()) + "T00:00:00Z");
  let current = 0;
  if (prev !== null && today - prev <= 86_400_000) current = run;
  return { current, max, activeDays: days.length };
}

export async function getTotals(userId: string) {
  const [[passed], [quiz], [practice], [materials]] = await Promise.all([
    db
      .select({ n: count() })
      .from(topicProgress)
      .where(and(eq(topicProgress.userId, userId), eq(topicProgress.status, "passed"))),
    db
      .select({
        correct: sum(quizAttempts.correct).mapWith(Number),
        attempts: count(),
        passedTests: sql<number>`count(*) filter (where ${quizAttempts.passed})`.mapWith(Number),
      })
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, userId)),
    db.select({ n: count() }).from(practiceChecks).where(eq(practiceChecks.userId, userId)),
    db.select({ n: count() }).from(userMaterials).where(eq(userMaterials.userId, userId)),
  ]);
  return {
    topicsPassed: passed?.n ?? 0,
    correctAnswers: quiz?.correct ?? 0,
    quizAttempts: quiz?.attempts ?? 0,
    testsPassed: quiz?.passedTests ?? 0,
    practiceDone: practice?.n ?? 0,
    materials: materials?.n ?? 0,
  };
}

export async function getRecentPasses(userId: string, limit = 8) {
  return db
    .select({
      roadmap: topicProgress.roadmap,
      topic: topicProgress.topic,
      passedAt: topicProgress.passedAt,
      bestScore: topicProgress.bestScore,
    })
    .from(topicProgress)
    .where(and(eq(topicProgress.userId, userId), eq(topicProgress.status, "passed")))
    .orderBy(desc(topicProgress.passedAt))
    .limit(limit);
}

export async function getUserMaterialsList(userId: string, limit = 20) {
  return db
    .select()
    .from(userMaterials)
    .where(eq(userMaterials.userId, userId))
    .orderBy(desc(userMaterials.createdAt))
    .limit(limit);
}
