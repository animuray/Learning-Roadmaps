"use client";

import { useOptimistic, useTransition } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import { togglePractice } from "@/app/actions/learning";
import type { PracticeItem } from "@/lib/content";

export function PracticeChecklist({
  roadmap,
  topic,
  items,
  done,
  disabled,
}: {
  roadmap: string;
  topic: string;
  items: PracticeItem[];
  done: string[];
  disabled?: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(new Set(done), (state, action: { key: string; on: boolean }) => {
    const next = new Set(state);
    if (action.on) next.add(action.key);
    else next.delete(action.key);
    return next;
  });
  const [, startTransition] = useTransition();
  const count = items.filter((i) => optimistic.has(i.key)).length;

  return (
    <div className="mt-3">
      <div className="mb-2 text-xs text-muted">
        Выполнено {count} из {items.length}
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => {
          const on = optimistic.has(item.key);
          return (
            <li key={item.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  startTransition(async () => {
                    setOptimistic({ key: item.key, on: !on });
                    await togglePractice(roadmap, topic, item.key, !on);
                  })
                }
                className={clsx(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition",
                  on ? "border-passed/40 bg-passed-soft" : "border-line hover:bg-surface-2",
                  disabled && "cursor-not-allowed opacity-70",
                )}
              >
                <span
                  className={clsx(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2",
                    on ? "border-passed bg-passed text-white" : "border-muted/50",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                </span>
                <span
                  className={clsx("prose-content", on && "text-muted line-through decoration-1")}
                  dangerouslySetInnerHTML={{ __html: item.html }}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
