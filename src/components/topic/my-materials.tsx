"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { addMaterial, deleteMaterial, type FormState } from "@/app/actions/learning";

type Item = { id: number; title: string; url: string; note: string | null };

export function MyMaterials({ roadmap, topic, items }: { roadmap: string; topic: string; items: Item[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addMaterial.bind(null, roadmap, topic), null);
  const [open, setOpen] = useState(items.length === 0);
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="mt-3">
      {items.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {items.map((m) => (
            <li key={m.id} className="group flex items-start gap-2 rounded-lg border border-line p-2.5">
              <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                  {m.title}
                </a>
                <div className="truncate text-xs text-muted">{m.url}</div>
                {m.note && <div className="mt-1 text-sm">{m.note}</div>}
              </div>
              <button
                type="button"
                onClick={() => startTransition(() => deleteMaterial(m.id))}
                className="rounded p-1 text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
                title="Удалить"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form ref={formRef} action={formAction} className="grid gap-2 rounded-xl bg-surface-2 p-3 sm:grid-cols-2">
          <input
            name="url"
            required
            placeholder="https://..."
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm sm:col-span-2"
          />
          <input name="title" placeholder="Название (необязательно)" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
          <input name="note" placeholder="Комментарий: что полезного" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              <Plus className="size-4" /> {pending ? "Сохраняю…" : "Добавить ссылку"}
            </button>
            {state?.error && <span className="text-sm text-danger">{state.error}</span>}
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <Plus className="size-4" /> Добавить ссылку
        </button>
      )}
    </div>
  );
}
