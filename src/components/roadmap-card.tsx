import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import type { Roadmap } from "@/lib/content";
import { ProgressBar } from "./progress-bar";

export function RoadmapCard({
  roadmap,
  stats,
  next,
  status = null,
}: {
  roadmap: Roadmap;
  stats: { total: number; passed: number; percent: number } | null;
  next?: { title: string; href: string } | null;
  /** Запись пользователя на роадмап: active — проходит, archived — в архиве, null — не начинал. */
  status?: "active" | "archived" | null;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-5">
      <Link href={`/roadmaps/${roadmap.slug}`} className="group">
        <h3 className="text-lg font-semibold group-hover:text-accent">{roadmap.title}</h3>
      </Link>
      {roadmap.description && <p className="mt-1.5 line-clamp-3 text-sm text-muted">{roadmap.description}</p>}
      <div className="mt-3 flex items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Layers className="size-3.5" /> {roadmap.sections.length} разделов
        </span>
        <span>{roadmap.topics.length} тем</span>
      </div>
      {status && (
        <span className="mt-3 w-fit rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
          {status === "active" ? "Прохожу" : "В архиве"}
        </span>
      )}
      {stats && status && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>
              {stats.passed} из {stats.total} тем
            </span>
            <span>{stats.percent}%</span>
          </div>
          <ProgressBar value={stats.percent} />
        </div>
      )}
      <div className="mt-auto pt-4">
        {next && status === "active" ? (
          <Link
            href={next.href}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Продолжить: {next.title} <ArrowRight className="size-4" />
          </Link>
        ) : (
          <Link
            href={`/roadmaps/${roadmap.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            {status === "active" ? "Открыть роадмап" : "Подробнее"} <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
