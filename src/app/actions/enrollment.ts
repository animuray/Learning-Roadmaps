"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getRoadmap } from "@/lib/content";
import { enroll, setArchived } from "@/lib/enrollment";
import { buildView } from "@/lib/roadmap-view";
import { getCurrentUser } from "@/lib/session";

/** Начать обучение по роадмапу (или вернуть его из архива) и перейти к следующей теме. */
export async function startLearning(roadmapSlug: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/roadmaps/${roadmapSlug}`)}`);
  const roadmap = getRoadmap(roadmapSlug);
  if (!roadmap) return;
  await enroll(user.id, roadmap.slug);
  const { next } = await buildView(roadmap, user.id);
  redirect(next ? `/roadmaps/${roadmap.slug}/${next.slug}` : `/roadmaps/${roadmap.slug}`);
}

/** Убрать роадмап из «Прохожу сейчас» в архив (true) или вернуть (false). Прогресс не трогаем. */
export async function archiveLearning(roadmapSlug: string, archived: boolean) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await setArchived(user.id, roadmapSlug, archived);
  refresh();
}
