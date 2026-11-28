import type { SqlCheck, SqlTask } from "./types";
import { renderMarkdown, type LinkResolver } from "./markdown";
import { fenceText, findFence, parseNotes, splitFences, splitTaskBlocks, taskKey, type Fence } from "./task-blocks";

/**
 * Раздел «## Тренажёр»: задачи интерактивного SQL-тренажёра.
 *
 * Формат (каждая задача — заголовок третьего уровня):
 *
 *   ### Выбрать дорогие товары
 *
 *   Условие задачи — обычный markdown.
 *
 *   ```sql seed            ← данные: схема и наполнение (выполняются перед запросом)
 *   CREATE TABLE products (...);
 *   INSERT INTO products VALUES (...);
 *   ```
 *
 *   ```sql check           ← эталонный запрос: результат пользователя сравнивается с ним
 *   SELECT name FROM products WHERE price > 100;
 *   ```
 *
 *   ```text hint           ← подсказка (необязательно)
 *   ```sql solution        ← эталонное решение (необязательно)
 *   ```text review         ← разбор эталона, показывается после решения (необязательно)
 *   ```text notes          ← замечания: «регулярка => объяснение» по тексту запроса (необязательно)
 *
 * Блок ```sql seed до первой задачи — общие данные для всех задач темы
 * (задача со своим seed использует свой).
 *
 * Варианты проверки:
 * - `sql check` — сравнение строк с эталонным запросом (порядок не важен);
 * - `sql check ordered` — то же, но порядок строк важен;
 * - `sql check state` — задача на изменение данных: контрольный запрос после
 *   запроса ученика должен вернуть хотя бы одну строку;
 * - `regex check` — регулярка по тексту результата.
 */

const isSeed = (f: Fence) => f.tags.includes("seed") || f.tags.includes("data");

/** Разбирает раздел «Тренажёр» в задачи. Ошибки собираются в warn и не роняют страницу. */
export function parseSqlTasks(md: string, resolver: LinkResolver, warn: (m: string) => void): SqlTask[] {
  const { intro, blocks } = splitTaskBlocks(md);
  if (!blocks.length) {
    warn('В разделе «Тренажёр» нет задач: каждая задача начинается с заголовка "### Название"');
    return [];
  }
  // Общие данные для всех задач темы — блок ```sql seed до первой задачи.
  const sharedSeed = fenceText(splitFences(intro).fences.find(isSeed));

  const tasks: SqlTask[] = [];
  const usedKeys = new Set<string>();

  for (const block of blocks) {
    const { condition, fences, unclosed } = splitFences(block.lines);
    if (unclosed) {
      warn(`Задача «${block.title}»: незакрытый блок кода`);
      continue;
    }

    const seedFence = fences.find(isSeed);
    const checkFence = fences.find((f) => f.tags.includes("check") || f.tags.includes("expected"));
    const hintFence = findFence(fences, "hint");
    const solutionFence = findFence(fences, "solution");
    const reviewFence = findFence(fences, "review");

    if (!checkFence) {
      warn(`Задача «${block.title}» пропущена: нет блока проверки \`\`\`sql check`);
      continue;
    }

    let check: SqlCheck;
    if (checkFence.lang === "regex") {
      const pattern = fenceText(checkFence);
      try {
        new RegExp(pattern, "i");
      } catch (e) {
        warn(`Задача «${block.title}»: неправильная регулярка (${e instanceof Error ? e.message : e})`);
        continue;
      }
      check = { kind: "regex", pattern };
    } else if (checkFence.lang === "sql") {
      const sql = fenceText(checkFence);
      if (!sql) {
        warn(`Задача «${block.title}»: пустой эталонный запрос`);
        continue;
      }
      if (checkFence.tags.includes("state")) {
        check = { kind: "state", sql };
      } else {
        check = { kind: "rows", sql, ordered: checkFence.tags.includes("ordered") };
      }
    } else {
      warn(`Задача «${block.title}»: блок проверки должен быть \`\`\`sql check или \`\`\`regex check`);
      continue;
    }

    const unknown = [seedFence, hintFence, solutionFence]
      .filter((f): f is Fence => !!f)
      .filter((f) => f.lang !== "sql" && f.lang !== "text")
      .map((f) => f.lang);
    if (unknown.length) warn(`Задача «${block.title}»: непонятный язык блока ${unknown.join(", ")}`);

    const conditionMd = condition.join("\n").trim();
    const review = fenceText(reviewFence);
    tasks.push({
      key: taskKey(block.title, conditionMd, usedKeys),
      title: block.title,
      conditionHtml: conditionMd ? renderMarkdown(conditionMd, resolver) : "",
      seed: fenceText(seedFence) || sharedSeed,
      check,
      hint: fenceText(hintFence) || null,
      solution: fenceText(solutionFence) || null,
      reviewHtml: review ? renderMarkdown(review, resolver) : null,
      notes: parseNotes(findFence(fences, "notes"), warn, block.title),
    });
  }
  return tasks;
}
