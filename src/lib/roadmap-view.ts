import "server-only";
import { getRoadmap, type Roadmap } from "@/lib/content";
import { computeStates, getRoadmapProgress, nextTopic, roadmapStats } from "@/lib/progress";

/** Роадмап + состояния тем для пользователя (или для гостя, если userId пуст). */
export async function getRoadmapView(slug: string, userId: string | null | undefined) {
  const roadmap = getRoadmap(slug);
  if (!roadmap) return null;
  return buildView(roadmap, userId);
}

export async function buildView(roadmap: Roadmap, userId: string | null | undefined) {
  const progress = await getRoadmapProgress(userId, roadmap.slug);
  const states = computeStates(roadmap, progress);
  const next = nextTopic(roadmap, states);
  return { roadmap, progress, states, stats: roadmapStats(roadmap, states), next };
}
