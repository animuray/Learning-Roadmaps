"use client";

import { useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { markTopicDone } from "@/app/actions/learning";

export function MarkDoneButton({ roadmap, topic, done }: { roadmap: string; topic: string; done: boolean }) {
  const [pending, startTransition] = useTransition();
  if (done) {
    return (
      <p className="mt-4 inline-flex items-center gap-1.5 font-medium text-passed">
        <CircleCheck className="size-5" /> Тема отмечена изученной
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => markTopicDone(roadmap, topic))}
      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60"
    >
      <CircleCheck className="size-4" /> {pending ? "Сохраняю…" : "Я изучил тему"}
    </button>
  );
}
