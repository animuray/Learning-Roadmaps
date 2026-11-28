import { createHash } from "node:crypto";
import type { Material, PracticeItem, Question } from "./types";
import { renderInline, renderMarkdown, type LinkResolver } from "./markdown";

const QUIZ_HEADINGS = ["тест", "вопросы", "проверь себя", "quiz", "test"];
const PRACTICE_HEADINGS = ["практика", "задания", "лабораторная", "practice"];
const MATERIALS_HEADINGS = ["материалы", "ссылки", "источники", "materials", "links"];
const TRAINER_HEADINGS = ["тренажёр", "тренажер", "тренажёр sql", "тренажер sql", "sql trainer", "trainer"];
const LAB_HEADINGS = ["лаборатория", "лабораторная работа", "терминал", "lab"];

/** Сравнение заголовков без ё и лишних знаков: «Тренажёр» === «тренажер». */
function normHeading(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[:.!?]+$/, "").trim();
}

export type SplitNote = {
  body: string;
  quiz: string | null;
  practice: string | null;
  materials: string | null;
  trainer: string | null;
  lab: string | null;
};

/** Делит заметку по заголовкам второго уровня: служебные разделы уходят отдельно. */
export function splitNote(content: string): SplitNote {
  const lines = content.split(/\r?\n/);
  const result: SplitNote = { body: "", quiz: null, practice: null, materials: null, trainer: null, lab: null };
  let current: keyof SplitNote = "body";
  const buckets: Record<keyof SplitNote, string[]> = { body: [], quiz: [], practice: [], materials: [], trainer: [], lab: [] };
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h2 = !inFence && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h2) {
      const name = normHeading(h2[1]);
      if (QUIZ_HEADINGS.includes(name)) {
        current = "quiz";
        continue;
      }
      if (PRACTICE_HEADINGS.includes(name)) {
        current = "practice";
        continue;
      }
      if (MATERIALS_HEADINGS.includes(name)) {
        current = "materials";
        continue;
      }
      if (TRAINER_HEADINGS.includes(name)) {
        current = "trainer";
        continue;
      }
      if (LAB_HEADINGS.includes(name)) {
        current = "lab";
        continue;
      }
      current = "body";
    }
    buckets[current].push(line);
  }
  result.body = buckets.body.join("\n").trim();
  if (buckets.quiz.length) result.quiz = buckets.quiz.join("\n");
  if (buckets.practice.length) result.practice = buckets.practice.join("\n");
  if (buckets.materials.length) result.materials = buckets.materials.join("\n");
  if (buckets.trainer.length) result.trainer = buckets.trainer.join("\n");
  if (buckets.lab.length) result.lab = buckets.lab.join("\n");
  return result;
}

function hash(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 10);
}

const OPTION_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const ANSWER_RE = /^\s*=\s+(.+)$/;

/**
 * Формат теста (раздел «## Тест»):
 *
 *   ### Текст вопроса
 *   (необязательно: пояснение, код)
 *   - [ ] неверный вариант
 *   - [x] верный вариант        ← несколько [x] = вопрос с несколькими ответами
 *   = ответ                       ← вместо вариантов: ввод ответа текстом (можно несколько строк =)
 *   > Объяснение, которое покажут после ответа
 */
export function parseQuiz(md: string, resolver: LinkResolver, warn: (m: string) => void): Question[] {
  const blocks: { title: string; lines: string[] }[] = [];
  let inFence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h3 = !inFence && line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      blocks.push({ title: h3[1], lines: [] });
    } else if (blocks.length) {
      blocks[blocks.length - 1].lines.push(line);
    }
  }

  const questions: Question[] = [];
  for (const block of blocks) {
    const body: string[] = [];
    const options: { text: string; correct: boolean }[] = [];
    const answers: string[] = [];
    const explanation: string[] = [];
    let fence = false;
    for (const line of block.lines) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      if (!fence) {
        const opt = line.match(OPTION_RE);
        if (opt) {
          options.push({ text: opt[2].trim(), correct: opt[1].toLowerCase() === "x" });
          continue;
        }
        const ans = line.match(ANSWER_RE);
        if (ans) {
          answers.push(ans[1].trim());
          continue;
        }
        if (/^\s*>/.test(line)) {
          explanation.push(line.replace(/^\s*>\s?/, ""));
          continue;
        }
      }
      body.push(line);
    }

    const correctCount = options.filter((o) => o.correct).length;
    let type: Question["type"];
    if (answers.length) type = "text";
    else if (correctCount === 1) type = "single";
    else if (correctCount > 1) type = "multiple";
    else {
      warn(`Вопрос «${block.title}» пропущен: нет отмеченного [x] варианта или строки «= ответ»`);
      continue;
    }

    questions.push({
      id: hash(block.title + "\n" + body.join("\n").trim()),
      type,
      titleHtml: renderInline(block.title, resolver),
      bodyHtml: body.join("\n").trim() ? renderMarkdown(body.join("\n"), resolver) : "",
      options: options.map((o, i) => ({ id: i, html: renderInline(o.text, resolver), correct: o.correct })),
      answers,
      explanationHtml: explanation.join("\n").trim() ? renderMarkdown(explanation.join("\n"), resolver) : "",
    });
  }
  return questions;
}

/** Раздел «## Практика»: пункты `- [ ] ...` становятся чек-листом, остальное — вводным текстом. */
export function parsePractice(md: string, resolver: LinkResolver) {
  const items: PracticeItem[] = [];
  const intro: string[] = [];
  let fence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && line.match(OPTION_RE);
    if (m) items.push({ key: hash(m[2].trim()), html: renderInline(m[2].trim(), resolver) });
    else intro.push(line);
  }
  return {
    introHtml: intro.join("\n").trim() ? renderMarkdown(intro.join("\n"), resolver) : "",
    items,
  };
}

/** Раздел «## Материалы»: строки вида `- [Название](https://...) — комментарий` */
export function parseMaterials(md: string): Material[] {
  const out: Material[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*(?:[—–:-]\s*(.*))?$/);
    if (m) out.push({ title: m[1].trim(), url: m[2], note: m[3]?.trim() || undefined });
    else {
      const bare = line.match(/^\s*[-*+]\s+(https?:\/\/\S+)\s*(?:[—–:-]\s*(.*))?$/);
      if (bare) out.push({ title: bare[1], url: bare[1], note: bare[2]?.trim() || undefined });
    }
  }
  return out;
}
