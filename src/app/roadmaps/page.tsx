import type { Metadata } from "next";
import { getRoadmaps } from "@/lib/content";
import { buildView } from "@/lib/roadmap-view";
import { getCurrentUser } from "@/lib/session";
import { RoadmapCard } from "@/components/roadmap-card";

export const metadata: Metadata = { title: "Роадмапы" };

export default async function RoadmapsPage() {
  const user = await getCurrentUser();
  const views = await Promise.all(getRoadmaps().map((r) => buildView(r, user?.id)));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">Роадмапы</h1>
      <p className="mt-2 text-muted">Выберите направление и проходите темы по порядку.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {views.map((v) => (
          <RoadmapCard
            key={v.roadmap.slug}
            roadmap={v.roadmap}
            stats={user ? v.stats : null}
            next={user && v.next ? { title: v.next.title, href: `/roadmaps/${v.roadmap.slug}/${v.next.slug}` } : null}
          />
        ))}
      </div>
    </div>
  );
}
