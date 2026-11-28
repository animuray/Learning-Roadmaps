import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, ClipboardCheck, Hammer, Link2, Unlock } from "lucide-react";
import { getRoadmaps } from "@/lib/content";
import { buildView } from "@/lib/roadmap-view";
import { getCurrentUser } from "@/lib/session";
import { RoadmapCard } from "@/components/roadmap-card";

export default async function HomePage() {
  // Вошедшим главная не нужна — сразу их обучение (как «Моё обучение» на Stepik).
  if (await getCurrentUser()) redirect("/learning");
  const roadmaps = getRoadmaps();
  const views = await Promise.all(roadmaps.map((r) => buildView(r, null)));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <section className="rounded-3xl border border-line bg-surface p-8 md:p-12">
        <p className="text-sm font-medium text-accent">Самостоятельное обучение по роадмапам</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">
          Изучай тему, закрепляй практикой, сдавай тест — и открывай следующую
        </h1>
        <p className="mt-4 max-w-2xl text-muted">
          Каждая тема — конспект, практика, ваши ссылки и заметки. Тест проверяет не только конспект, а всё важное по
          теме. Прогресс, серии дней и активность видны в профиле.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/register" className="rounded-xl bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90">
            Зарегистрироваться
          </Link>
          <Link href="/login" className="rounded-xl border border-line px-5 py-2.5 font-medium hover:bg-surface-2">
            Войти
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold">Роадмапы</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {views.map((v) => (
            <RoadmapCard
              key={v.roadmap.slug}
              roadmap={v.roadmap}
              stats={null}
            />
          ))}
          {views.length === 0 && (
            <p className="text-muted">
              Роадмапов пока нет. Добавьте папку с файлом <code>roadmap.md</code> в <code>content/roadmaps/</code>.
            </p>
          )}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-xl font-semibold">Как устроено обучение</h2>
        <div className="grid gap-4 md:grid-cols-5">
          {[
            { icon: BookOpen, title: "Изучите тему", text: "Прочитайте конспект на сайте и материалы в интернете." },
            { icon: Link2, title: "Сохраните источники", text: "Прикрепите ссылки, по которым учились, и свои заметки." },
            { icon: Hammer, title: "Практика", text: "Выполните задания из чек-листа на своём стенде." },
            { icon: ClipboardCheck, title: "Тест", text: "Ответьте на вопросы. Для зачёта нужно 80% и больше." },
            { icon: Unlock, title: "Следующая тема", text: "Сдали тест — открывается следующая тема роадмапа." },
          ].map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                  {i + 1}
                </span>
                <s.icon className="size-4" />
              </div>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
