import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, or } from "drizzle-orm";
import {
  BookCheck,
  CalendarDays,
  CircleCheck,
  ExternalLink,
  Flame,
  Globe,
  Hammer,
  Link2,
  Lock,
  Send,
  Settings,
  Target,
  Trophy,
} from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getRoadmap, getRoadmaps } from "@/lib/content";
import { buildView } from "@/lib/roadmap-view";
import { getCurrentUser } from "@/lib/session";
import { getActivityByDay, getRecentPasses, getStreaks, getTotals, getUserMaterialsList } from "@/lib/stats";
import { Avatar } from "@/components/avatar";
import { Heatmap } from "@/components/profile/heatmap";
import { ProgressBar } from "@/components/progress-bar";

async function findUser(handle: string) {
  const h = decodeURIComponent(handle);
  const [user] = await db
    .select()
    .from(users)
    .where(/^[0-9a-f-]{36}$/.test(h) ? or(eq(users.handle, h), eq(users.id, h)) : eq(users.handle, h.toLowerCase()));
  return user ?? null;
}

export async function generateMetadata({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  const user = await findUser(handle);
  return { title: user?.isPublic ? (user.name ?? user.handle ?? "Профиль") : "Профиль" };
}

export default async function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  const [user, viewer] = await Promise.all([findUser(handle), getCurrentUser()]);
  if (!user) notFound();
  const isOwner = viewer?.id === user.id;

  if (!user.isPublic && !isOwner) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <Lock className="mx-auto size-8 text-muted" />
        <h1 className="mt-3 text-xl font-semibold">Профиль скрыт</h1>
        <p className="mt-1 text-muted">Пользователь закрыл свой профиль.</p>
      </div>
    );
  }

  const [activity, streaks, totals, recent, materials, views] = await Promise.all([
    getActivityByDay(user.id),
    getStreaks(user.id),
    getTotals(user.id),
    getRecentPasses(user.id),
    getUserMaterialsList(user.id, 10),
    Promise.all(getRoadmaps().map((r) => buildView(r, user.id))),
  ]);
  const started = views.filter((v) => v.stats.passedAll > 0 || v.progress.size > 0);
  const name = user.name ?? user.handle ?? "Без имени";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-8 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside>
          <Avatar name={name} image={user.image} size={160} />
          <h1 className="mt-4 text-2xl font-bold">{name}</h1>
          {user.handle && <div className="text-muted">@{user.handle}</div>}
          {user.bio && <p className="mt-3 whitespace-pre-line text-sm">{user.bio}</p>}

          <ul className="mt-5 space-y-2.5 text-sm">
            <li className="flex items-center gap-2">
              <BookCheck className="size-4 text-muted" /> <b>{totals.topicsPassed}</b> тем изучено
            </li>
            <li className="flex items-center gap-2">
              <CircleCheck className="size-4 text-muted" /> <b>{totals.correctAnswers}</b> верных ответов
            </li>
            <li className="flex items-center gap-2">
              <Hammer className="size-4 text-muted" /> <b>{totals.practiceDone}</b> практических заданий
            </li>
            <li className="flex items-center gap-2">
              <Link2 className="size-4 text-muted" /> <b>{totals.materials}</b> материалов сохранено
            </li>
          </ul>

          <div className="mt-5 space-y-2 border-t border-line pt-5 text-sm text-muted">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4" /> С нами с{" "}
              {user.createdAt.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
            </div>
            {user.telegram && (
              <a href={`https://t.me/${user.telegram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-fg">
                <Send className="size-4" /> @{user.telegram}
              </a>
            )}
            {user.github && (
              <a href={`https://github.com/${user.github}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-fg">
                <GitHubIcon /> {user.github}
              </a>
            )}
            {user.website && (
              <a href={user.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-fg">
                <Globe className="size-4" /> {user.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>

          {isOwner && (
            <Link
              href="/settings"
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <Settings className="size-4" /> Редактировать профиль
            </Link>
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
            <h2 className="text-lg font-semibold">Активность за последний год</h2>
            <div className="mt-4">
              <Heatmap data={activity} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
              <Stat icon={<Flame className="size-4 text-orange-500" />} value={streaks.current} label="дней без перерыва" />
              <Stat icon={<Trophy className="size-4 text-yellow-500" />} value={streaks.max} label="макс. серия дней" />
              <Stat icon={<CalendarDays className="size-4 text-accent" />} value={streaks.activeDays} label="дней с занятиями" />
              <Stat icon={<Target className="size-4 text-passed" />} value={totals.testsPassed} label="тестов сдано" />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
            <h2 className="text-lg font-semibold">Роадмапы</h2>
            {started.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Пока ни одной пройденной темы.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {started.map((v) => (
                  <div key={v.roadmap.slug}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <Link href={`/roadmaps/${v.roadmap.slug}`} className="font-medium hover:text-accent">
                        {v.roadmap.title}
                      </Link>
                      <span className="text-sm text-muted">
                        {v.stats.passed}/{v.stats.total} · {v.stats.percent}%
                      </span>
                    </div>
                    <ProgressBar value={v.stats.percent} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
              <h2 className="text-lg font-semibold">Недавно изучено</h2>
              {recent.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Здесь появятся пройденные темы.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {recent.map((r) => {
                    const rm = getRoadmap(r.roadmap);
                    const t = rm?.topics.find((x) => x.slug === r.topic);
                    return (
                      <li key={`${r.roadmap}/${r.topic}`} className="flex items-start gap-2">
                        <CircleCheck className="mt-0.5 size-4 shrink-0 text-passed" />
                        <div className="min-w-0 flex-1">
                          {t ? (
                            <Link href={`/roadmaps/${r.roadmap}/${r.topic}`} className="hover:text-accent">
                              {t.title}
                            </Link>
                          ) : (
                            <span>{r.topic}</span>
                          )}
                          <div className="text-xs text-muted">
                            {r.passedAt?.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                            {r.bestScore > 0 && ` · ${r.bestScore}%`}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
              <h2 className="text-lg font-semibold">Материалы</h2>
              {materials.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Ссылки, сохранённые в темах, появятся здесь.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {materials.map((m) => {
                    const t = getRoadmap(m.roadmap)?.topics.find((x) => x.slug === m.topic);
                    return (
                      <li key={m.id} className="flex items-start gap-2">
                        <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted" />
                        <div className="min-w-0">
                          <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            {m.title}
                          </a>
                          {t && <div className="text-xs text-muted">{t.title}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-2xl font-bold">
        {icon}
        {value}
      </div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
