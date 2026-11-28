import "server-only";
import { and, desc, eq, gte, sql, sum, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  labSolves,
  practiceChecks,
  quizAttempts,
  sqlSolves,
  topicProgress,
  userMaterials,
  users,
} from "@/db/schema";
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

/**
 * Метрики профиля: одна строка на пользователя. Практические задания — пункты чек-листа «Практика»,
 * задачи SQL-тренажёра и лабораторий. Тест считается сданным один раз, сколько бы попыток ни было.
 */
// В подзапросах drizzle пишет столбцы без имени таблицы, и "id" достался бы таблице подзапроса.
const outerUserId = sql.raw(`"user"."id"`);

function userMetrics(where: SQL) {
  return db
    .select({
      id: users.id,
      name: users.name,
      handle: users.handle,
      image: users.image,
      topicsPassed: sql<number>`(select count(*) from ${topicProgress} where ${topicProgress.userId} = ${outerUserId} and ${topicProgress.status} = 'passed')`.mapWith(Number),
      testsPassed: sql<number>`(select count(distinct ${quizAttempts.roadmap} || '/' || ${quizAttempts.topic}) from ${quizAttempts} where ${quizAttempts.userId} = ${outerUserId} and ${quizAttempts.passed})`.mapWith(Number),
      correctAnswers: sql<number>`(select coalesce(sum(${quizAttempts.correct}), 0) from ${quizAttempts} where ${quizAttempts.userId} = ${outerUserId})`.mapWith(Number),
      practiceDone: sql<number>`((select count(*) from ${practiceChecks} where ${practiceChecks.userId} = ${outerUserId})
        + (select count(*) from ${sqlSolves} where ${sqlSolves.userId} = ${outerUserId})
        + (select count(*) from ${labSolves} where ${labSolves.userId} = ${outerUserId}))`.mapWith(Number),
      materials: sql<number>`(select count(*) from ${userMaterials} where ${userMaterials.userId} = ${outerUserId})`.mapWith(Number),
    })
    .from(users)
    .where(where);
}

export type UserTotals = {
  topicsPassed: number;
  testsPassed: number;
  correctAnswers: number;
  practiceDone: number;
  materials: number;
};

export async function getTotals(userId: string): Promise<UserTotals> {
  const [row] = await userMetrics(eq(users.id, userId));
  return {
    topicsPassed: row?.topicsPassed ?? 0,
    testsPassed: row?.testsPassed ?? 0,
    correctAnswers: row?.correctAnswers ?? 0,
    practiceDone: row?.practiceDone ?? 0,
    materials: row?.materials ?? 0,
  };
}

/** Очки за каждую метрику в рейтинге: за изученную тему больше, чем за сохранённую ссылку. */
export const SCORE_WEIGHTS: Record<keyof UserTotals, number> = {
  topicsPassed: 10,
  testsPassed: 5,
  practiceDone: 3,
  correctAnswers: 1,
  materials: 1,
};

/** «1 очко», «3 очка», «5 очков». */
export function points(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "очко";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "очка";
  return "очков";
}

export function totalScore(t: UserTotals): number {
  return (Object.keys(SCORE_WEIGHTS) as (keyof UserTotals)[]).reduce((s, k) => s + t[k] * SCORE_WEIGHTS[k], 0);
}

export type LeaderboardRow = UserTotals & {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  score: number;
  place: number;
};

/** Рейтинг по сумме очков. Только публичные профили и только те, у кого есть хоть что-то. */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const rows = await userMetrics(eq(users.isPublic, true));
  const scored = rows
    .map((r) => ({ ...r, score: totalScore(r) }))
    .sort((a, b) => b.score - a.score || b.topicsPassed - a.topicsPassed || (a.name ?? "").localeCompare(b.name ?? "", "ru"));
  // Одинаковые очки — одно место: 1, 2, 2, 4.
  let place = 0;
  return scored.map((r, i) => {
    if (i === 0 || scored[i - 1].score !== r.score) place = i + 1;
    return { ...r, place };
  });
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
