import { CircleAlert } from "lucide-react";

/** Замечания к решению: рабочее, но есть что улучшить. */
export function SolutionNotes({ notes }: { notes: string[] }) {
  return (
    <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
        <CircleAlert className="size-4" /> Замечания к решению
      </div>
      <ul className="mt-1.5 list-disc space-y-1 pl-5">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

/** Разбор эталона: как решают на практике и почему. */
export function Review({ html }: { html: string }) {
  return (
    <details className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm" open>
      <summary className="cursor-pointer select-none font-medium">Разбор: как решают на практике</summary>
      <div className="prose-content mt-2" dangerouslySetInnerHTML={{ __html: html }} />
    </details>
  );
}
