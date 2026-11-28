import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTopic } from "@/lib/content";
import { buildAttempt } from "@/lib/quiz";
import { getRoadmapView } from "@/lib/roadmap-view";
import { requireUser } from "@/lib/session";
import { QuizRunner } from "@/components/quiz/quiz-runner";

export async function generateMetadata({ params }: PageProps<"/roadmaps/[roadmap]/[topic]/test">) {
  const { roadmap, topic } = await params;
  return { title: `Тест: ${getTopic(roadmap, topic)?.title ?? ""}` };
}

export default async function TestPage({ params }: PageProps<"/roadmaps/[roadmap]/[topic]/test">) {
  const { roadmap: rmSlug, topic: topicSlug } = await params;
  const user = await requireUser(`/roadmaps/${rmSlug}/${topicSlug}/test`);
  const view = await getRoadmapView(rmSlug, user.id);
  const topic = getTopic(rmSlug, topicSlug);
  if (!view || !topic) notFound();
  const state = view.states.get(topic.slug);
  if (state === "locked" || topic.quiz.length === 0) redirect(`/roadmaps/${rmSlug}/${topicSlug}`);

  const next = view.roadmap.topics[topic.index + 1] ?? null;
  const { token, questions } = buildAttempt(topic);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/roadmaps/${rmSlug}/${topicSlug}`} className="text-sm text-muted hover:text-fg">
        ← {topic.title}
      </Link>
      <h1 className="mt-2 text-2xl font-bold md:text-3xl">Тест: {topic.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {questions.length} вопросов · зачёт от {topic.passScore}% · вопросы и варианты перемешиваются при каждой попытке
      </p>
      <QuizRunner
        key={token}
        questions={questions}
        target={{
          kind: "test",
          roadmap: rmSlug,
          topic: topicSlug,
          passScore: topic.passScore,
          next: next ? { title: next.title, href: `/roadmaps/${rmSlug}/${next.slug}` } : null,
          topicHref: `/roadmaps/${rmSlug}/${topicSlug}`,
          roadmapHref: `/roadmaps/${rmSlug}`,
        }}
      />
    </div>
  );
}
