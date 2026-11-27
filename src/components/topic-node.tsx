import Link from "next/link";
import { Check, Lock } from "lucide-react";
import clsx from "clsx";
import type { TopicRef } from "@/lib/content";
import type { TopicState } from "@/lib/progress";

export function TopicNode({
  roadmap,
  topic,
  state,
  isNext,
  side,
}: {
  roadmap: string;
  topic: TopicRef;
  state: TopicState;
  isNext: boolean;
  side: "left" | "right";
}) {
  const sub = topic.subtopics.slice(0, 4).join(" · ") + (topic.subtopics.length > 4 ? ` · ещё ${topic.subtopics.length - 4}` : "");
  const body = (
    <>
      <div className={clsx("flex items-start gap-2", side === "left" && "md:flex-row-reverse md:text-right")}>
        <span
          className={clsx(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
            state === "passed" && "bg-passed text-white",
            state === "locked" && "bg-locked text-muted",
            (state === "available" || state === "started") && "bg-black/10 text-black/70 dark:bg-black/25 dark:text-black/80",
          )}
        >
          {state === "passed" ? <Check className="size-3" /> : state === "locked" ? <Lock className="size-3" /> : topic.index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-snug">{topic.title}</div>
          {sub && <div className="mt-0.5 line-clamp-2 text-xs opacity-70">{sub}</div>}
          <div className={clsx("mt-1 flex flex-wrap gap-1.5 text-[11px]", side === "left" && "md:justify-end")}>
            {isNext && <span className="rounded bg-accent px-1.5 py-0.5 font-medium text-white">Вы здесь</span>}
            {topic.optional && <span className="rounded border border-current/30 px-1.5 py-0.5 opacity-70">необязательно</span>}
            {!topic.notePath && <span className="rounded border border-current/30 px-1.5 py-0.5 opacity-60">нет конспекта</span>}
          </div>
        </div>
      </div>
    </>
  );

  const cls = clsx(
    "block w-full rounded-xl border-2 px-3 py-2.5 text-sm transition md:max-w-sm",
    topic.optional && "border-dashed",
    state === "passed" && "border-passed/50 bg-passed-soft hover:border-passed",
    (state === "available" || state === "started") && "border-yellow-500/70 bg-node text-black hover:-translate-y-0.5 hover:shadow-md",
    state === "started" && "bg-node-soft dark:text-fg",
    state === "locked" && "cursor-not-allowed border-line bg-surface-2 text-muted",
    isNext && "ring-4 ring-accent/30",
  );

  if (state === "locked") {
    return (
      <div className={cls} title="Сначала пройдите предыдущие темы">
        {body}
      </div>
    );
  }
  return (
    <Link href={`/roadmaps/${roadmap}/${topic.slug}`} className={cls}>
      {body}
    </Link>
  );
}
