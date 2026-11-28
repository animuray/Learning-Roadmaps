import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArchiveRestore, ArrowRight, Check, Flame } from "lucide-react";
import { archiveLearning } from "@/app/actions/enrollment";
import { getRoadmap } from "@/lib/content";
import { getEnrollments } from "@/lib/enrollment";
import { buildView } from "@/lib/roadmap-view";
import { requireUser } from "@/lib/session";
import { dayKey, getActivityByDay, getStreaks, getTotals } from "@/lib/stats";
import { ProgressBar } from "@/components/progress-bar";

export const metadata: Metadata = { title: "Моё обучение" };

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/** «1 день», «3 дня», «5 дней». */
function days(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "день";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "дня";
  return "дней";
}

/** Дни текущей недели (с понедельника, по UTC — как серии и тепловая карта). */
function currentWeek(): string[] {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => dayKey(new Date(monday.getTime() + i * 86_400_000)));
}

function Initials({ title }: { title: string }) {
  const letters = title
    .split(/[\s—-]+/)
    .filter((w) => /^[A-Za-zА-Яа-яЁё]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-base font-bold text-white">
      {letters || "R"}
    </span>
  );
}

export default async function LearningPage() {
  const user = await requireUser("/learning");
  const [enrollments, streak, activity, totals] = await Promise.all([
    getEnrollments(user.id),
    getStreaks(user.id),
    getActivityByDay(user.id, 14),
    getTotals(user.id),
  ]);

  const items = (
    await Promise.all(
      enrollments.map(async (e) => {
        const roadmap = getRoadmap(e.roadmap);
        return roadmap ? { enrollment: e, view: await buildView(roadmap, user.id) } : null;
      }),
    )
  ).filter((x) => x !== null);
  const active = items.filter((i) => i.enrollment.status === "active");
  const archived = items.filter((i) => i.enrollment.status === "archived");
  const current = active[0];

  const week = currentWeek();
  const today = dayKey(new Date());
  const doneToday = (activity.get(today) ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Моё обучение</h1>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {current ? (
          <section className="flex flex-col rounded-2xl border border-line bg-accent-soft p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">{current.view.roadmap.title}</h2>
              <Initials title={current.view.roadmap.title} />
            </div>
            <ProgressBar value={current.view.stats.percent} className="mt-4 bg-surface" />
            <p className="mt-2 text-sm">
              <b>{current.view.stats.percent}%</b> пройдено · {current.view.stats.passed} из {current.view.stats.total} тем
            </p>
            {current.view.next && <p className="mt-1 text-sm text-muted">Дальше: {current.view.next.title}</p>}
            <div className="mt-auto pt-5">
              <Link
                href={
                  current.view.next
                    ? `/roadmaps/${current.view.roadmap.slug}/${current.view.next.slug}`
                    : `/roadmaps/${current.view.roadmap.slug}`
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
              >
                {current.view.next ? "Продолжить" : "Открыть роадмап"} <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>
        ) : (
          <section className="flex flex-col justify-center rounded-2xl border border-dashed border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Вы пока ничего не проходите</h2>
            <p className="mt-1 text-sm text-muted">Выберите роадмап в каталоге и начните обучение.</p>
            <Link
              href="/roadmaps"
              className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
            >
              Выбрать роадмап <ArrowRight className="size-4" />
            </Link>
          </section>
        )}

        <section className="rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full border border-line">
              <Flame className={`size-5 ${streak.current > 0 ? "text-orange-500" : "text-muted"}`} />
            </span>
            <div>
              <div className="text-lg font-semibold">
                {streak.current} {days(streak.current)} без перерыва
              </div>
              <div className="text-sm text-muted">
                Рекорд — {streak.max} {days(streak.max)}
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-1.5">
            {week.map((d, i) => {
              const done = (activity.get(d) ?? 0) > 0;
              const isToday = d === today;
              const future = d > today;
              return (
                <div key={d} className="flex flex-col items-center gap-1">
                  <span className={`text-[11px] ${future ? "text-muted/60" : "text-muted"}`}>{WEEKDAYS[i]}</span>
                  <span
                    className={`grid size-8 place-items-center rounded-lg ${
                      done ? "bg-passed text-white" : future ? "bg-surface-2/50" : "bg-surface-2"
                    } ${isToday ? "ring-2 ring-passed ring-offset-1 ring-offset-surface" : ""}`}
                  >
                    {done && <Check className="size-4" />}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-muted">
            {doneToday ? "Сегодня вы уже занимались — серия продолжается." : "Позанимайтесь сегодня, чтобы не прервать серию."}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <b className="text-lg">{totals.practiceDone}</b> заданий решено
            </span>
            <span>
              <b className="text-lg">{totals.testsPassed}</b> тестов сдано
            </span>
            <span>
              <b className="text-lg">{streak.activeDays}</b> {days(streak.activeDays)} занятий
            </span>
          </div>
        </section>
      </div>

      {active.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Прохожу сейчас</h2>
          <ul className="mt-4 space-y-3">
            {active.map(({ view }) => (
              <LearningRow key={view.roadmap.slug} view={view} archived={false} />
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Архив</h2>
          <p className="mt-1 text-sm text-muted">Прогресс сохранён — можно вернуться в любой момент.</p>
          <ul className="mt-4 space-y-3">
            {archived.map(({ view }) => (
              <LearningRow key={view.roadmap.slug} view={view} archived />
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-sm text-muted">
        Ещё роадмапы — в{" "}
        <Link href="/roadmaps" className="text-accent hover:underline">
          каталоге
        </Link>
        .
      </p>
    </div>
  );
}

function LearningRow({ view, archived }: { view: Awaited<ReturnType<typeof buildView>>; archived: boolean }) {
  const { roadmap, stats, next } = view;
  const href = next ? `/roadmaps/${roadmap.slug}/${next.slug}` : `/roadmaps/${roadmap.slug}`;
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
      <Initials title={roadmap.title} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Link href={`/roadmaps/${roadmap.slug}`} className="font-medium hover:text-accent">
            {roadmap.title}
          </Link>
          <span className="text-sm text-muted">
            {stats.passed}/{stats.total} тем{stats.percent === 100 ? " · пройден" : ""}
          </span>
        </div>
        <ProgressBar value={stats.percent} className="mt-2 max-w-md" />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {!archived && (
            <Link href={href} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              {next ? "Продолжить" : "Открыть"} <ArrowRight className="size-3.5" />
            </Link>
          )}
          <form action={archiveLearning.bind(null, roadmap.slug, !archived)}>
            <button className="inline-flex items-center gap-1 text-muted hover:text-fg">
              {archived ? (
                <>
                  <ArchiveRestore className="size-3.5" /> Вернуть в обучение
                </>
              ) : (
                <>
                  <Archive className="size-3.5" /> В архив
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
