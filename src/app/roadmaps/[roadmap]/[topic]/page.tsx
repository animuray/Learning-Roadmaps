import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleCheck,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Hammer,
  Lock,
  NotebookPen,
  Signal,
  Terminal,
  TerminalSquare,
} from "lucide-react";
import { db } from "@/db";
import { labSolves, practiceChecks, sqlSolves, userMaterials, userNotes } from "@/db/schema";
import { getRoadmap, getTopic } from "@/lib/content";
import { getEnrollment, touchEnrollment } from "@/lib/enrollment";
import { canUseLab, labConfig } from "@/lib/lab";
import { blockingTopic } from "@/lib/progress";
import { getRoadmapView } from "@/lib/roadmap-view";
import { getCurrentUser } from "@/lib/session";
import { MarkDoneButton } from "@/components/topic/mark-done-button";
import { MyMaterials } from "@/components/topic/my-materials";
import { NoteEditor } from "@/components/topic/note-editor";
import { PracticeChecklist } from "@/components/topic/practice-checklist";
import { LabPanel } from "@/components/topic/lab-panel";
import { SqlTrainer } from "@/components/topic/sql-trainer";
import { ViewTracker } from "@/components/topic/view-tracker";

export async function generateMetadata({ params }: PageProps<"/roadmaps/[roadmap]/[topic]">) {
  const { roadmap, topic } = await params;
  const t = getTopic(roadmap, topic);
  return { title: t?.title ?? "Тема", description: t?.description || getRoadmap(roadmap)?.title };
}

export default async function TopicPage({ params }: PageProps<"/roadmaps/[roadmap]/[topic]">) {
  const { roadmap: rmSlug, topic: topicSlug } = await params;
  const user = await getCurrentUser();
  const view = await getRoadmapView(rmSlug, user?.id);
  const topic = getTopic(rmSlug, topicSlug);
  if (!view || !topic) notFound();
  // Темы открываются после «Начать обучение» на странице роадмапа (как курс на Stepik).
  if (user) {
    const enrollment = await getEnrollment(user.id, rmSlug);
    if (enrollment?.status !== "active") redirect(`/roadmaps/${rmSlug}`);
    await touchEnrollment(user.id, rmSlug);
  }
  const { roadmap, states, progress } = view;
  const state = states.get(topic.slug)!;
  const section = roadmap.sections.find((s) => s.id === topic.sectionId);
  const prev = roadmap.topics[topic.index - 1] ?? null;
  const next = roadmap.topics[topic.index + 1] ?? null;
  const nextState = next ? states.get(next.slug) : null;

  if (state === "locked") {
    const blocker = blockingTopic(roadmap, states, topic.slug);
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-surface-2">
          <Lock className="size-6 text-muted" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">{topic.title}</h1>
        <p className="mt-2 text-muted">Тема откроется, когда вы пройдёте предыдущие темы роадмапа.</p>
        {blocker && (
          <Link
            href={`/roadmaps/${roadmap.slug}/${blocker.slug}`}
            className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
          >
            Перейти к теме «{blocker.title}» <ArrowRight className="size-4" />
          </Link>
        )}
        {!user && (
          <p className="mt-4 text-sm text-muted">
            <Link href={`/login?callbackUrl=/roadmaps/${roadmap.slug}/${topic.slug}`} className="text-accent hover:underline">
              Войдите
            </Link>
            , чтобы сохранять прогресс.
          </p>
        )}
        <div className="mt-8">
          <Link href={`/roadmaps/${roadmap.slug}`} className="text-sm text-muted hover:text-fg">
            ← К карте роадмапа
          </Link>
        </div>
      </div>
    );
  }

  const [checks, materials, note, solves, labDone] = user
    ? await Promise.all([
        db
          .select({ key: practiceChecks.itemKey })
          .from(practiceChecks)
          .where(
            and(
              eq(practiceChecks.userId, user.id),
              eq(practiceChecks.roadmap, roadmap.slug),
              eq(practiceChecks.topic, topic.slug),
            ),
          ),
        db
          .select()
          .from(userMaterials)
          .where(
            and(
              eq(userMaterials.userId, user.id),
              eq(userMaterials.roadmap, roadmap.slug),
              eq(userMaterials.topic, topic.slug),
            ),
          )
          .orderBy(desc(userMaterials.createdAt)),
        db
          .select({ body: userNotes.body, updatedAt: userNotes.updatedAt })
          .from(userNotes)
          .where(and(eq(userNotes.userId, user.id), eq(userNotes.roadmap, roadmap.slug), eq(userNotes.topic, topic.slug)))
          .then((r) => r[0] ?? null),
        db
          .select({ key: sqlSolves.taskKey })
          .from(sqlSolves)
          .where(
            and(eq(sqlSolves.userId, user.id), eq(sqlSolves.roadmap, roadmap.slug), eq(sqlSolves.topic, topic.slug)),
          ),
        db
          .select({ key: labSolves.taskKey })
          .from(labSolves)
          .where(
            and(eq(labSolves.userId, user.id), eq(labSolves.roadmap, roadmap.slug), eq(labSolves.topic, topic.slug)),
          ),
      ])
    : [[], [], null, [], []];

  const p = progress.get(topic.slug);
  const hasQuiz = topic.quiz.length > 0;
  const passed = state === "passed";
  const hasTrainer = topic.tasks.length > 0;
  const solvedKeys = solves.map((s) => s.key);
  const trainerDone = hasTrainer && topic.tasks.every((t) => solvedKeys.includes(t.key));
  const lab = topic.lab;
  const labSolvedKeys = labDone.map((s) => s.key);
  const labFinished = !!lab && lab.tasks.every((t) => labSolvedKeys.includes(t.key));
  const labUnavailable = !lab
    ? null
    : !labConfig()
      ? "Терминал на этом сервере не настроен: нужен учебный стенд и lab-runner (docs/practice-lab.md). Задачи можно прочитать и решить на своей машине."
      : user && !canUseLab(user)
        ? "Терминал учебного стенда доступен только пользователям из списка допущенных."
        : null;
  const steps = [
    { href: "#konspekt", icon: <BookOpen className="size-4" />, label: "Конспект и материалы" },
    { href: "#praktika", icon: <Hammer className="size-4" />, label: "Практика" },
    ...(hasTrainer ? [{ href: "#trenazher", icon: <Terminal className="size-4" />, label: "Тренажёр", done: trainerDone }] : []),
    ...(lab ? [{ href: "#laboratoriya", icon: <TerminalSquare className="size-4" />, label: "Лаборатория", done: labFinished }] : []),
    { href: "#test", icon: <ClipboardCheck className="size-4" />, label: "Тест", done: passed },
  ];
  const stepCols = ["", "", "", "sm:grid-cols-3", "sm:grid-cols-4", "sm:grid-cols-5"][steps.length];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {user && <ViewTracker roadmap={roadmap.slug} topic={topic.slug} />}

      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        <Link href={`/roadmaps/${roadmap.slug}`} className="hover:text-fg">
          {roadmap.title}
        </Link>
        <span>/</span>
        <Link href={`/roadmaps/${roadmap.slug}#${section?.id}`} className="hover:text-fg">
          {section?.title}
        </Link>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="min-w-0">
          <header>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium text-muted">
                Тема {topic.index + 1} из {roadmap.topics.length}
              </span>
              {passed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-passed-soft px-2.5 py-1 font-medium text-passed">
                  <CircleCheck className="size-3.5" /> Изучено
                </span>
              )}
              {topic.optional && (
                <span className="rounded-full border border-dashed border-muted px-2.5 py-1 text-muted">Необязательная</span>
              )}
              {topic.duration && (
                <span className="inline-flex items-center gap-1 text-muted">
                  <Clock className="size-3.5" /> ~{topic.duration} мин
                </span>
              )}
              {topic.level && (
                <span className="inline-flex items-center gap-1 text-muted">
                  <Signal className="size-3.5" /> {topic.level}
                </span>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{topic.title}</h1>
            {topic.description && <p className="mt-2 text-lg text-muted">{topic.description}</p>}
            {topic.subtopics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {topic.subtopics.map((s) => (
                  <span key={s} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <ol className={`mt-6 grid grid-cols-2 gap-2 text-sm ${stepCols}`}>
              {steps.map((s, i) => (
                <Step key={s.href} href={s.href} n={i + 1} icon={s.icon} label={s.label} done={s.done} />
              ))}
            </ol>
          </header>

          <section id="konspekt" className="mt-8 scroll-mt-20 rounded-2xl border border-line bg-surface p-5 md:p-8">
            {topic.bodyHtml ? (
              <div className="prose-content" dangerouslySetInnerHTML={{ __html: topic.bodyHtml }} />
            ) : (
              <div className="text-muted">
                <p className="font-medium text-fg">Конспект по этой теме ещё не написан.</p>
                <p className="mt-2">
                  Изучите тему по материалам в интернете, сохраните ссылки ниже и запишите главное в свои заметки.
                  {topic.subtopics.length > 0 && " Ориентируйтесь на подтемы выше."}
                </p>
              </div>
            )}
          </section>

          {topic.materials.length > 0 && (
            <section className="mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6">
              <h2 className="text-lg font-semibold">Материалы для изучения</h2>
              <ul className="mt-3 space-y-2">
                {topic.materials.map((m) => (
                  <li key={m.url}>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-2 rounded-lg p-2 hover:bg-surface-2"
                    >
                      <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted" />
                      <span>
                        <span className="font-medium text-accent group-hover:underline">{m.title}</span>
                        {m.type && <span className="ml-2 text-xs text-muted">{m.type}</span>}
                        {m.note && <span className="block text-sm text-muted">{m.note}</span>}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6">
            <h2 className="text-lg font-semibold">Мои материалы</h2>
            <p className="mt-1 text-sm text-muted">Ссылки на статьи, видео и курсы, по которым вы изучали тему.</p>
            {user ? (
              <MyMaterials
                roadmap={roadmap.slug}
                topic={topic.slug}
                items={materials.map((m) => ({ id: m.id, title: m.title, url: m.url, note: m.note }))}
              />
            ) : (
              <LoginHint what="сохранять свои ссылки" />
            )}
          </section>

          <section id="praktika" className="mt-6 scroll-mt-20 rounded-2xl border border-line bg-surface p-5 md:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Hammer className="size-5" /> Практика
            </h2>
            {topic.practiceIntroHtml && (
              <div className="prose-content mt-3" dangerouslySetInnerHTML={{ __html: topic.practiceIntroHtml }} />
            )}
            {topic.practice.length > 0 ? (
              <PracticeChecklist
                roadmap={roadmap.slug}
                topic={topic.slug}
                items={topic.practice}
                done={checks.map((c) => c.key)}
                disabled={!user}
              />
            ) : (
              <p className="mt-2 text-sm text-muted">
                Заданий пока нет. Попробуйте всё из конспекта руками на своём стенде.
              </p>
            )}
          </section>

          {hasTrainer && (
            <section id="trenazher" className="mt-6 scroll-mt-20 rounded-2xl border border-line bg-surface p-5 md:p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Terminal className="size-5" /> Тренажёр SQL
              </h2>
              <p className="mt-1 text-sm text-muted">
                Напишите запрос и нажмите «Проверить»: он выполнится в изолированной базе, результат сравним с эталоном.
                {solvedKeys.length > 0 && ` Решено задач: ${solvedKeys.length} из ${topic.tasks.length}.`}
              </p>
              <SqlTrainer
                roadmap={roadmap.slug}
                topic={topic.slug}
                tasks={topic.tasks.map((t) => ({
                  key: t.key,
                  title: t.title,
                  conditionHtml: t.conditionHtml,
                  seed: t.seed,
                  hint: t.hint,
                  solution: t.solution,
                }))}
                solved={solvedKeys}
                disabled={!user}
              />
            </section>
          )}

          {lab && (
            <section id="laboratoriya" className="mt-6 scroll-mt-20 rounded-2xl border border-line bg-surface p-5 md:p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <TerminalSquare className="size-5" /> Лаборатория
              </h2>
              <p className="mt-1 text-sm text-muted">
                Настоящий Linux в терминале ниже. Решайте как удобно: проверка смотрит на результат, а после решения
                покажет замечания и разбор того, как это делают на практике.
              </p>
              <LabPanel
                roadmap={roadmap.slug}
                topic={topic.slug}
                tasks={lab.tasks.map((t) => ({
                  key: t.key,
                  title: t.title,
                  conditionHtml: t.conditionHtml,
                  hint: t.hint,
                  solution: t.solution,
                }))}
                solved={labSolvedKeys}
                disabled={!user}
                unavailable={labUnavailable}
              />
            </section>
          )}

          <section className="mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <NotebookPen className="size-5" /> Мои заметки
            </h2>
            {user ? (
              <NoteEditor
                roadmap={roadmap.slug}
                topic={topic.slug}
                initial={note?.body ?? ""}
                updatedAt={note?.updatedAt?.toISOString() ?? null}
              />
            ) : (
              <LoginHint what="вести заметки по теме" />
            )}
          </section>

          <section id="test" className="mt-6 scroll-mt-20 rounded-2xl border-2 border-accent/40 bg-accent-soft p-5 md:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ClipboardCheck className="size-5" /> Проверка знаний
            </h2>
            {hasQuiz ? (
              <>
                <p className="mt-1 text-sm text-muted">
                  {topic.quizSize} вопросов из банка в {topic.quiz.length}. Для зачёта нужно {topic.passScore}% правильных
                  ответов.
                  {p && p.attempts > 0 && ` Попыток: ${p.attempts}, лучший результат: ${p.bestScore}%.`}
                </p>
                {user ? (
                  <Link
                    href={`/roadmaps/${roadmap.slug}/${topic.slug}/test`}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
                  >
                    {passed ? "Пройти тест ещё раз" : "Пройти тест"} <ArrowRight className="size-4" />
                  </Link>
                ) : (
                  <LoginHint what="проходить тесты" />
                )}
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">
                  Тест к этой теме ещё не написан. Когда изучите тему, отметьте её изученной — откроется следующая.
                </p>
                {user ? <MarkDoneButton roadmap={roadmap.slug} topic={topic.slug} done={passed} /> : <LoginHint what="отмечать темы" />}
              </>
            )}
          </section>

          <nav className="mt-8 flex flex-col justify-between gap-3 sm:flex-row">
            {prev ? (
              <Link
                href={`/roadmaps/${roadmap.slug}/${prev.slug}`}
                className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm hover:bg-surface-2"
              >
                <ArrowLeft className="size-4" />
                <span>
                  <span className="block text-xs text-muted">Предыдущая</span>
                  {prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next &&
              (nextState === "locked" ? (
                <span className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-right text-sm text-muted sm:justify-end">
                  <span>
                    <span className="block text-xs">Следующая — откроется после теста</span>
                    {next.title}
                  </span>
                  <Lock className="size-4" />
                </span>
              ) : (
                <Link
                  href={`/roadmaps/${roadmap.slug}/${next.slug}`}
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-right text-sm hover:bg-surface-2 sm:justify-end"
                >
                  <span>
                    <span className="block text-xs text-muted">Следующая</span>
                    {next.title}
                  </span>
                  <ArrowRight className="size-4" />
                </Link>
              ))}
          </nav>
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <div className="font-semibold">Статус</div>
              <div className="mt-2 text-muted">
                {passed
                  ? `Тема изучена${p?.bestScore ? `, лучший результат ${p.bestScore}%` : ""}`
                  : state === "started"
                    ? "В процессе изучения"
                    : "Ещё не начата"}
              </div>
              <a
                href="#test"
                className="mt-3 block rounded-lg bg-accent px-3 py-2 text-center font-medium text-white hover:opacity-90"
              >
                {hasQuiz ? (passed ? "Пересдать тест" : "К тесту") : passed ? "Изучено" : "Отметить изученной"}
              </a>
            </div>
            {topic.toc.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
                <div className="font-semibold">Содержание</div>
                <ul className="mt-2 space-y-1.5">
                  {topic.toc.map((h) => (
                    <li key={h.id} className={h.depth === 3 ? "pl-3" : ""}>
                      <a href={`#${h.id}`} className="text-muted hover:text-fg">
                        {h.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Step({ href, n, icon, label, done }: { href: string; n: number; icon: React.ReactNode; label: string; done?: boolean }) {
  return (
    <li>
      <a
        href={href}
        className="flex h-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 hover:bg-surface-2"
      >
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? "bg-passed text-white" : "bg-accent-soft text-accent"}`}
        >
          {n}
        </span>
        <span className="hidden text-muted sm:inline">{icon}</span>
        <span className="leading-tight">{label}</span>
      </a>
    </li>
  );
}

function LoginHint({ what }: { what: string }) {
  return (
    <p className="mt-3 text-sm text-muted">
      <Link href="/login" className="font-medium text-accent hover:underline">
        Войдите
      </Link>
      , чтобы {what}.
    </p>
  );
}
