"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { practiceChecks, quizAttempts, topicProgress, userMaterials, userNotes } from "@/db/schema";
import { getRoadmap, getTopic } from "@/lib/content";
import { computeStates, getRoadmapProgress, logActivity, markStarted } from "@/lib/progress";
import { gradeQuestion, type QuestionResult } from "@/lib/quiz";
import { scheduleMistakes } from "@/lib/review";
import { getCurrentUser } from "@/lib/session";

async function authedTopic(roadmapSlug: string, topicSlug: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Нужно войти");
  const roadmap = getRoadmap(roadmapSlug);
  const topic = roadmap ? getTopic(roadmapSlug, topicSlug) : null;
  if (!roadmap || !topic) throw new Error("Тема не найдена");
  const progress = await getRoadmapProgress(user.id, roadmapSlug);
  const state = computeStates(roadmap, progress).get(topicSlug);
  if (state === "locked") throw new Error("Тема ещё заблокирована");
  return { user, roadmap, topic, progress, state };
}

/* ---------------------------- просмотр темы ---------------------------- */

export async function trackTopicView(roadmapSlug: string, topicSlug: string) {
  const { user } = await authedTopic(roadmapSlug, topicSlug);
  await markStarted(user.id, roadmapSlug, topicSlug);
  await logActivity(user.id, "read", { roadmap: roadmapSlug, topic: topicSlug, oncePerDay: true });
}

/* -------------------------------- тест -------------------------------- */

const submitSchema = z.object({
  roadmap: z.string(),
  topic: z.string(),
  answers: z
    .array(
      z.object({
        questionId: z.string(),
        selected: z.array(z.number().int()).optional(),
        text: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export type QuizSubmitResult = {
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  passScore: number;
  newlyPassed: boolean;
  results: QuestionResult[];
};

export async function submitQuiz(input: z.infer<typeof submitSchema>): Promise<QuizSubmitResult> {
  const data = submitSchema.parse(input);
  const { user, topic, progress } = await authedTopic(data.roadmap, data.topic);
  if (topic.quiz.length === 0) throw new Error("У темы нет теста");

  const byId = new Map(topic.quiz.map((q) => [q.id, q]));
  const ids = new Set(data.answers.map((a) => a.questionId));
  const expected = topic.quizSize || topic.quiz.length;
  if (ids.size !== data.answers.length || ids.size < expected || [...ids].some((id) => !byId.has(id))) {
    throw new Error("Набор вопросов не совпадает с тестом. Обновите страницу.");
  }

  const graded = data.answers.map((a) => {
    const q = byId.get(a.questionId)!;
    return { q, ok: gradeQuestion(q, a) };
  });
  const correct = graded.filter((g) => g.ok).length;
  const total = graded.length;
  const score = Math.round((correct / total) * 100);
  const passed = score >= topic.passScore;
  const wasPassed = progress.get(topic.slug)?.status === "passed";

  await db.insert(quizAttempts).values({
    userId: user.id,
    roadmap: data.roadmap,
    topic: data.topic,
    correct,
    total,
    score,
    passed,
  });
  await db
    .insert(topicProgress)
    .values({
      userId: user.id,
      roadmap: data.roadmap,
      topic: data.topic,
      status: passed ? "passed" : "started",
      bestScore: score,
      attempts: 1,
      passedAt: passed ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [topicProgress.userId, topicProgress.roadmap, topicProgress.topic],
      set: {
        attempts: sql`${topicProgress.attempts} + 1`,
        bestScore: sql`greatest(${topicProgress.bestScore}, ${score})`,
        status: passed ? "passed" : sql`${topicProgress.status}`,
        passedAt: passed ? sql`coalesce(${topicProgress.passedAt}, now())` : sql`${topicProgress.passedAt}`,
        updatedAt: new Date(),
      },
    });

  await scheduleMistakes(
    user.id,
    data.roadmap,
    data.topic,
    graded.filter((g) => !g.ok).map((g) => g.q.id),
  );
  await logActivity(user.id, "quiz", { roadmap: data.roadmap, topic: data.topic, amount: Math.max(correct, 1) });
  if (passed && !wasPassed) {
    await logActivity(user.id, "pass", { roadmap: data.roadmap, topic: data.topic, amount: 3 });
  }

  const reveal = passed;
  return {
    correct,
    total,
    score,
    passed,
    passScore: topic.passScore,
    newlyPassed: passed && !wasPassed,
    results: graded.map(({ q, ok }) => ({
      questionId: q.id,
      correct: ok,
      ...(reveal
        ? {
            correctOptionIds: q.options.filter((o) => o.correct).map((o) => o.id),
            acceptedAnswers: q.type === "text" ? q.answers : undefined,
            explanationHtml: q.explanationHtml,
          }
        : {}),
    })),
  };
}

/** Для тем без теста: отметить изученной вручную. */
export async function markTopicDone(roadmapSlug: string, topicSlug: string) {
  const { user, topic, progress } = await authedTopic(roadmapSlug, topicSlug);
  if (topic.quiz.length > 0) throw new Error("У этой темы есть тест — пройдите его");
  if (progress.get(topicSlug)?.status === "passed") return;
  await db
    .insert(topicProgress)
    .values({ userId: user.id, roadmap: roadmapSlug, topic: topicSlug, status: "passed", passedAt: new Date() })
    .onConflictDoUpdate({
      target: [topicProgress.userId, topicProgress.roadmap, topicProgress.topic],
      set: { status: "passed", passedAt: new Date(), updatedAt: new Date() },
    });
  await logActivity(user.id, "pass", { roadmap: roadmapSlug, topic: topicSlug, amount: 3 });
  refresh();
}

/* ------------------------------ практика ------------------------------ */

export async function togglePractice(roadmapSlug: string, topicSlug: string, itemKey: string, done: boolean) {
  const { user, topic } = await authedTopic(roadmapSlug, topicSlug);
  if (!topic.practice.some((p) => p.key === itemKey)) throw new Error("Нет такого пункта");
  if (done) {
    const inserted = await db
      .insert(practiceChecks)
      .values({ userId: user.id, roadmap: roadmapSlug, topic: topicSlug, itemKey })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) await logActivity(user.id, "practice", { roadmap: roadmapSlug, topic: topicSlug });
  } else {
    await db
      .delete(practiceChecks)
      .where(
        and(
          eq(practiceChecks.userId, user.id),
          eq(practiceChecks.roadmap, roadmapSlug),
          eq(practiceChecks.topic, topicSlug),
          eq(practiceChecks.itemKey, itemKey),
        ),
      );
  }
  refresh();
}

/* ---------------------------- мои материалы ---------------------------- */

const materialSchema = z.object({
  title: z.string().trim().max(200).optional(),
  url: z.string().trim().url("Нужна ссылка вида https://...").max(2000),
  note: z.string().trim().max(1000).optional(),
});

export type FormState = { ok?: boolean; error?: string } | null;

export async function addMaterial(
  roadmapSlug: string,
  topicSlug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user } = await authedTopic(roadmapSlug, topicSlug);
  const parsed = materialSchema.safeParse({
    title: formData.get("title") || undefined,
    url: formData.get("url"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  if (!/^https?:\/\//i.test(parsed.data.url)) return { error: "Ссылка должна начинаться с http:// или https://" };
  let title = parsed.data.title;
  if (!title) {
    try {
      title = new URL(parsed.data.url).hostname.replace(/^www\./, "");
    } catch {
      title = parsed.data.url;
    }
  }
  await db.insert(userMaterials).values({
    userId: user.id,
    roadmap: roadmapSlug,
    topic: topicSlug,
    title,
    url: parsed.data.url,
    note: parsed.data.note,
  });
  await logActivity(user.id, "material", { roadmap: roadmapSlug, topic: topicSlug });
  refresh();
  return { ok: true };
}

export async function deleteMaterial(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Нужно войти");
  await db.delete(userMaterials).where(and(eq(userMaterials.id, id), eq(userMaterials.userId, user.id)));
  refresh();
}

/* ------------------------------- заметки ------------------------------- */

export async function saveNote(roadmapSlug: string, topicSlug: string, body: string) {
  const { user } = await authedTopic(roadmapSlug, topicSlug);
  const text = String(body ?? "").slice(0, 50_000);
  const [existing] = await db
    .select({ body: userNotes.body })
    .from(userNotes)
    .where(and(eq(userNotes.userId, user.id), eq(userNotes.roadmap, roadmapSlug), eq(userNotes.topic, topicSlug)));
  if (existing?.body === text) return { savedAt: new Date().toISOString() };
  await db
    .insert(userNotes)
    .values({ userId: user.id, roadmap: roadmapSlug, topic: topicSlug, body: text })
    .onConflictDoUpdate({
      target: [userNotes.userId, userNotes.roadmap, userNotes.topic],
      set: { body: text, updatedAt: new Date() },
    });
  await logActivity(user.id, "note", { roadmap: roadmapSlug, topic: topicSlug, oncePerDay: true });
  return { savedAt: new Date().toISOString() };
}
