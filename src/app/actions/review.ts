"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reviewItems } from "@/db/schema";
import { getTopic } from "@/lib/content";
import { logActivity } from "@/lib/progress";
import { gradeQuestion, type QuestionResult } from "@/lib/quiz";
import { schedulePass, scheduleMistakes } from "@/lib/review";
import { getCurrentUser } from "@/lib/session";

const reviewSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string(),
        selected: z.array(z.number().int()).optional(),
        text: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export type ReviewResult = {
  correct: number;
  total: number;
  /** На повторении правильные ответы и пояснения показываются всегда: это не зачёт, а заучивание. */
  results: (QuestionResult & { nextInDays: number | null })[];
};

export async function submitReview(input: z.infer<typeof reviewSchema>): Promise<ReviewResult> {
  const data = reviewSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Нужно войти");

  const ids = [...new Set(data.answers.map((a) => a.questionId))];
  const items = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, user.id), inArray(reviewItems.questionId, ids)));
  const byId = new Map(items.map((i) => [i.questionId, i]));

  const results: ReviewResult["results"] = [];
  for (const a of data.answers) {
    const item = byId.get(a.questionId);
    const q = item && getTopic(item.roadmap, item.topic)?.quiz.find((x) => x.id === a.questionId);
    if (!item || !q) continue;
    const ok = gradeQuestion(q, a);
    let nextInDays: number | null;
    if (ok) {
      nextInDays = await schedulePass(user.id, item, item.box);
    } else {
      await scheduleMistakes(user.id, item.roadmap, item.topic, [item.questionId]);
      nextInDays = 1;
    }
    results.push({
      questionId: q.id,
      correct: ok,
      correctOptionIds: q.options.filter((o) => o.correct).map((o) => o.id),
      acceptedAnswers: q.type === "text" ? q.answers : undefined,
      explanationHtml: q.explanationHtml,
      nextInDays,
    });
  }
  if (results.length === 0) throw new Error("Эти вопросы уже повторены. Обновите страницу.");

  const correct = results.filter((r) => r.correct).length;
  await logActivity(user.id, "review", { amount: Math.max(correct, 1) });
  return { correct, total: results.length, results };
}
