"use client";

import { useEffect, useRef, useState } from "react";
import { saveNote } from "@/app/actions/learning";

/** Личный конспект по теме с автосохранением через 1,5 секунды после последнего изменения. */
export function NoteEditor({
  roadmap,
  topic,
  initial,
  updatedAt,
}: {
  roadmap: string;
  topic: string;
  initial: string;
  updatedAt: string | null;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<string>(updatedAt ? `Сохранено ${fmt(updatedAt)}` : "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(initial);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function schedule(next: string) {
    setValue(next);
    setStatus("Есть несохранённые изменения");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (next === saved.current) return;
      setStatus("Сохраняю…");
      try {
        const res = await saveNote(roadmap, topic, next);
        saved.current = next;
        setStatus(`Сохранено ${fmt(res.savedAt)}`);
      } catch {
        setStatus("Не удалось сохранить");
      }
    }, 1500);
  }

  return (
    <div className="mt-3">
      <textarea
        value={value}
        onChange={(e) => schedule(e.target.value)}
        rows={8}
        placeholder="Главное по теме своими словами, команды, грабли, на которые наступили…"
        className="w-full resize-y rounded-xl border border-line bg-surface-2 p-3 font-mono text-sm leading-relaxed"
      />
      <div className="mt-1 text-xs text-muted">{status || "Заметки видите только вы. Сохраняются автоматически."}</div>
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
