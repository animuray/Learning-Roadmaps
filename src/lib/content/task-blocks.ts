import { createHash } from "node:crypto";
import type { SolutionNote } from "./types";

/**
 * Общие части разбора тренажёров («## Тренажёр» для SQL, «## Лаборатория» для терминала):
 * задачи — заголовки ###, внутри — условие и блоки кода с информационной строкой
 * (```sql check, ```bash setup, ```text hint ...).
 */

export type Fence = { tags: string[]; lang: string; lines: string[] };
export type TaskBlock = { title: string; lines: string[] };

/** Делит раздел на задачи по ###; всё до первой задачи — вступление раздела. */
export function splitTaskBlocks(md: string): { intro: string[]; blocks: TaskBlock[] } {
  const blocks: TaskBlock[] = [];
  const intro: string[] = [];
  let inFence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h3 = !inFence && line.match(/^###\s+(.+?)\s*$/);
    if (h3) blocks.push({ title: h3[1].trim(), lines: [] });
    else if (blocks.length) blocks[blocks.length - 1].lines.push(line);
    else intro.push(line);
  }
  return { intro, blocks };
}

/** Отделяет блоки кода с информационной строкой (```sql seed) от обычного текста. */
export function splitFences(lines: string[]): { condition: string[]; fences: Fence[]; unclosed: boolean } {
  const condition: string[] = [];
  const fences: Fence[] = [];
  let open: Fence | null = null;
  let openMarker = "";

  for (const line of lines) {
    const fenceOpen = line.match(/^\s*(```|~~~)\s*([^\s`]*)\s*(.*?)\s*$/);
    if (!open && fenceOpen && fenceOpen[2]) {
      const info = (fenceOpen[2] + " " + fenceOpen[3]).trim().toLowerCase();
      const parts = info.split(/\s+/);
      open = { lang: parts[0], tags: parts.slice(1), lines: [] };
      openMarker = fenceOpen[1];
      continue;
    }
    if (open && new RegExp(`^\\s*${openMarker}\\s*$`).test(line)) {
      fences.push(open);
      open = null;
      continue;
    }
    if (open) open.lines.push(line);
    else condition.push(line);
  }
  return { condition, fences, unclosed: open !== null };
}

export const fenceText = (f: Fence | undefined): string => f?.lines.join("\n").trim() ?? "";
export const findFence = (fences: Fence[], tag: string): Fence | undefined => fences.find((f) => f.tags.includes(tag));

/** Ключ задачи — хеш заголовка и условия; повторы получают суффикс. */
export function taskKey(title: string, condition: string, used: Set<string>): string {
  let key = createHash("sha1").update(title + "\n" + condition).digest("hex").slice(10);
  if (used.has(key)) key = `${key}-${used.size}`;
  used.add(key);
  return key;
}

/**
 * Блок ```text notes — замечания к решению, по строке на правило:
 *
 *   chmod\s+777 => Права 777 открывают файл всем на запись ...
 *
 * Слева — регулярное выражение (без учёта регистра) по коду ученика: SQL-запросу
 * или командам из истории терминала. Справа — объяснение. Строки с # — комментарии.
 */
export function parseNotes(fence: Fence | undefined, warn: (m: string) => void, taskTitle: string): SolutionNote[] {
  if (!fence) return [];
  const notes: SolutionNote[] = [];
  for (const raw of fence.lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf(" => ");
    if (at < 0) {
      warn(`Задача «${taskTitle}»: строка замечаний без « => »: ${line}`);
      continue;
    }
    const pattern = line.slice(0, at).trim();
    const message = line.slice(at + 4).trim();
    try {
      new RegExp(pattern, "im");
    } catch (e) {
      warn(`Задача «${taskTitle}»: неправильная регулярка в замечаниях (${e instanceof Error ? e.message : e})`);
      continue;
    }
    notes.push({ pattern, message });
  }
  return notes;
}

/** Замечания, подходящие под код ученика. */
export function matchNotes(notes: SolutionNote[], code: string): string[] {
  return notes.filter((n) => new RegExp(n.pattern, "im").test(code)).map((n) => n.message);
}
