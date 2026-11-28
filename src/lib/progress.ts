import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, topicProgress } from "@/db/schema";
import type { Roadmap, TopicRef } from "@/lib/content";

export type TopicState = "locked" | "available" | "started" | "passed";

export type ProgressRow = {
  topic: string;
  status: "started" | "passed";
  bestScore: number;
  attempts: number;
  passedAt: Date | null;
};

export async function getRoadmapProgress(
  userId: string | null | undefined,
  roadmap: string,
): Promise<Map<string, ProgressRow>> {
  const map = new Map<string, ProgressRow>();
  if (!userId) return map;
  const rows = await db
    .select({
      topic: topicProgress.topic,
      status: topicProgress.status,
      bestScore: topicProgress.bestScore,
      attempts: topicProgress.attempts,
      passedAt: topicProgress.passedAt,
    })
    .from(topicProgress)
    .where(and(eq(topicProgress.userId, userId), eq(topicProgress.roadmap, roadmap)));
  for (const r of rows) map.set(r.topic, r);
  return map;
}

/**
 * Состояние каждой темы. В последовательном режиме тема открыта, если пройдены
 * все предыдущие обязательные темы. Необязательные темы (#optional) открыты всегда и никого не блокируют.
 * При DEV_LOGIN=true (только локальная разработка) последовательность не применяется —
 * все темы открыты, чтобы проверять, как они написаны.
 */
export function computeStates(roadmap: Roadmap, progress: Map<string, ProgressRow>): Map<string, TopicState> {
  const devUnlockAll = process.env.DEV_LOGIN === "true";
  const states = new Map<string, TopicState>();
  let gateOpen = true;
  for (const t of roadmap.topics) {
    const p = progress.get(t.slug);
    const unlocked = devUnlockAll || roadmap.mode === "free" || gateOpen || t.optional;
    let state: TopicState;
    if (p?.status === "passed") state = "passed";
    else if (!unlocked) state = "locked";
    else if (p?.status === "started") state = "started";
    else state = "available";
    states.set(t.slug, state);
    if (!t.optional && state !== "passed") gateOpen = false;
  }
  return states;
}

/** Первая непройденная обязательная тема — «продолжить отсюда». */
export function nextTopic(roadmap: Roadmap, states: Map<string, TopicState>): TopicRef | null {
  return (
    roadmap.topics.find((t) => !t.optional && states.get(t.slug) !== "passed" && states.get(t.slug) !== "locked") ??
    null
  );
}

/** Ближайшая обязательная тема перед данной, которая ещё не пройдена (причина блокировки). */
export function blockingTopic(roadmap: Roadmap, states: Map<string, TopicState>, slug: string): TopicRef | null {
  const idx = roadmap.topics.findIndex((t) => t.slug === slug);
  for (let i = 0; i < idx; i++) {
    const t = roadmap.topics[i];
    if (!t.optional && states.get(t.slug) !== "passed") return t;
  }
  return null;
}

export function roadmapStats(roadmap: Roadmap, states: Map<string, TopicState>) {
  const required = roadmap.topics.filter((t) => !t.optional);
  const passed = required.filter((t) => states.get(t.slug) === "passed").length;
  const passedAll = roadmap.topics.filter((t) => states.get(t.slug) === "passed").length;
  return {
    total: required.length,
    passed,
    passedAll,
    percent: required.length ? Math.round((passed / required.length) * 100) : 0,
  };
}

export async function markStarted(userId: string, roadmap: string, topic: string) {
  await db
    .insert(topicProgress)
    .values({ userId, roadmap, topic, status: "started" })
    .onConflictDoNothing();
}

export type ActivityType = (typeof activities.$inferInsert)["type"];

export async function logActivity(
  userId: string,
  type: ActivityType,
  opts: { roadmap?: string; topic?: string; amount?: number; oncePerDay?: boolean } = {},
) {
  if (opts.oncePerDay) {
    const since = startOfUtcDay(new Date());
    const [exists] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.type, type),
          opts.roadmap ? eq(activities.roadmap, opts.roadmap) : sql`true`,
          opts.topic ? eq(activities.topic, opts.topic) : sql`true`,
          gte(activities.createdAt, since),
        ),
      )
      .limit(1);
    if (exists) return;
  }
  await db.insert(activities).values({
    userId,
    type,
    roadmap: opts.roadmap,
    topic: opts.topic,
    amount: opts.amount ?? 1,
  });
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
