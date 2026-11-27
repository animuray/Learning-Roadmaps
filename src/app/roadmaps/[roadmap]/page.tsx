import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Lock } from "lucide-react";
import { getRoadmap } from "@/lib/content";
import { getRoadmapView } from "@/lib/roadmap-view";
import { getCurrentUser } from "@/lib/session";
import { ProgressBar } from "@/components/progress-bar";
import { TopicNode } from "@/components/topic-node";

export async function generateMetadata({ params }: PageProps<"/roadmaps/[roadmap]">) {
  const { roadmap } = await params;
  const r = getRoadmap(roadmap);
  return { title: r?.title ?? "Роадмап", description: r?.description };
}

export default async function RoadmapPage({ params }: PageProps<"/roadmaps/[roadmap]">) {
  const { roadmap: slug } = await params;
  const user = await getCurrentUser();
  const view = await getRoadmapView(slug, user?.id);
  if (!view) notFound();
  const { roadmap, states, stats, next } = view;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="rounded-3xl border border-line bg-surface p-6 md:p-8">
        <Link href="/roadmaps" className="text-sm text-muted hover:text-fg">
          ← Все роадмапы
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{roadmap.title}</h1>
        {roadmap.description && <p className="mt-3 max-w-3xl text-muted">{roadmap.description}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <span>
            <b>{roadmap.sections.length}</b> разделов
          </span>
          <span>
            <b>{roadmap.topics.length}</b> тем
          </span>
          {roadmap.mode === "sequential" && (
            <span className="inline-flex items-center gap-1 text-muted">
              <Lock className="size-3.5" /> темы открываются по порядку
            </span>
          )}
        </div>
        {user ? (
          <div className="mt-5 max-w-xl">
            <div className="mb-1.5 flex justify-between text-sm">
              <span>
                Пройдено {stats.passed} из {stats.total}
              </span>
              <span className="font-semibold">{stats.percent}%</span>
            </div>
            <ProgressBar value={stats.percent} />
            {next && (
              <Link
                href={`/roadmaps/${roadmap.slug}/${next.slug}`}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Продолжить: {next.title} <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-accent-soft p-4 text-sm">
            <Link href={`/login?callbackUrl=/roadmaps/${roadmap.slug}`} className="font-medium text-accent hover:underline">
              Войдите через Google
            </Link>{" "}
            — чтобы сохранять прогресс, сдавать тесты и открывать темы.
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted">
          <Legend className="border-yellow-500/70 bg-node" label="Доступна" />
          <Legend className="border-passed/50 bg-passed-soft" label="Пройдена" icon={<Check className="size-3" />} />
          <Legend className="border-line bg-surface-2" label="Заблокирована" icon={<Lock className="size-3" />} />
          <Legend className="border-dashed border-muted" label="Необязательная" />
        </div>
      </header>

      <div className="rm-spine mt-10 space-y-12 pb-6">
        {roadmap.sections.map((section, si) => {
          const left = section.topics.filter((_, i) => i % 2 === 0);
          const right = section.topics.filter((_, i) => i % 2 === 1);
          const done = section.topics.filter((t) => states.get(t.slug) === "passed").length;
          return (
            <section key={section.id} id={section.id} className="relative">
              <div className="relative z-10 mx-auto max-w-md rounded-2xl border-2 border-accent bg-surface px-5 py-3 text-center shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-accent">Раздел {si + 1}</div>
                <h2 className="text-lg font-bold">{section.title}</h2>
                {section.description && <p className="mt-0.5 text-sm text-muted">{section.description}</p>}
                {user && (
                  <div className="mt-1 text-xs text-muted">
                    {done} / {section.topics.length}
                  </div>
                )}
              </div>
              {/* Мобильная версия: одна колонка по порядку */}
              <div className="mt-5 space-y-2.5 md:hidden">
                {section.topics.map((t) => (
                  <TopicNode
                    key={t.slug}
                    roadmap={roadmap.slug}
                    topic={t}
                    state={states.get(t.slug)!}
                    isNext={next?.slug === t.slug}
                    side="right"
                  />
                ))}
              </div>
              {/* Десктоп: темы по обе стороны от оси */}
              <div className="mt-6 hidden grid-cols-2 gap-x-20 md:grid">
                <div className="flex flex-col items-end gap-3">
                  {left.map((t) => (
                    <div key={t.slug} className="rm-left flex w-full justify-end">
                      <TopicNode
                        roadmap={roadmap.slug}
                        topic={t}
                        state={states.get(t.slug)!}
                        isNext={next?.slug === t.slug}
                        side="left"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex flex-col gap-3">
                  {right.map((t) => (
                    <div key={t.slug} className="rm-right flex w-full">
                      <TopicNode
                        roadmap={roadmap.slug}
                        topic={t}
                        state={states.get(t.slug)!}
                        isNext={next?.slug === t.slug}
                        side="right"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ className, label, icon }: { className: string; label: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`grid size-4 place-items-center rounded border-2 ${className}`}>{icon}</span>
      {label}
    </span>
  );
}
