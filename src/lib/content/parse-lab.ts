import type { Lab, LabTask } from "./types";
import { renderMarkdown, type LinkResolver } from "./markdown";
import { fenceText, findFence, parseNotes, splitFences, splitTaskBlocks, taskKey } from "./task-blocks";

/**
 * Раздел «## Лаборатория»: задачи, которые решаются в терминале учебного стенда.
 *
 *   ```lab                 ← настройки лаборатории (необязательно)
 *   stand: linux
 *   ```
 *
 *   ```bash lib            ← общие функции: подставляются и в подготовку, и в проверку (необязательно)
 *   ```
 *
 *   ```bash setup          ← общая подготовка для всех задач (необязательно)
 *   ```
 *
 *   ### Создать пользователя deploy
 *   Условие — обычный markdown.
 *
 *   ```bash setup          ← подготовка стенда к задаче, от root (необязательно)
 *   ```bash check          ← проверка, от root: код 0 — решено; вывод видит ученик
 *   ```text hint           ← подсказка — русский псевдокод (необязательно)
 *   ```bash solution       ← эталон: команды от имени student (необязательно)
 *   ```text review         ← разбор эталона после решения (необязательно)
 *   ```text notes          ← замечания: «регулярка => объяснение» по истории команд
 *
 * В check доступны функции `fail "сообщение"` (вывести и завершить с ошибкой)
 * и `ok "сообщение"` — так ученик видит, что именно не так.
 */
export function parseLab(md: string, resolver: LinkResolver, warn: (m: string) => void): Lab | null {
  const { intro, blocks } = splitTaskBlocks(md);
  if (!blocks.length) {
    warn('В разделе «Лаборатория» нет задач: каждая задача начинается с заголовка "### Название"');
    return null;
  }

  const introFences = splitFences(intro).fences;
  const settings = fenceText(introFences.find((f) => f.lang === "lab"));
  const stand = settings.match(/^\s*stand\s*:\s*([\w-]+)/m)?.[1] ?? "linux";
  const lib = fenceText(findFence(introFences, "lib"));
  const setup = fenceText(findFence(introFences, "setup"));

  const tasks: LabTask[] = [];
  const used = new Set<string>();
  for (const block of blocks) {
    const { condition, fences, unclosed } = splitFences(block.lines);
    if (unclosed) {
      warn(`Лаборатория, задача «${block.title}»: незакрытый блок кода`);
      continue;
    }
    const check = fenceText(findFence(fences, "check"));
    if (!check) {
      warn(`Лаборатория, задача «${block.title}» пропущена: нет блока \`\`\`bash check`);
      continue;
    }
    const conditionMd = condition.join("\n").trim();
    const review = fenceText(findFence(fences, "review"));
    tasks.push({
      key: taskKey(block.title, conditionMd, used),
      title: block.title,
      conditionHtml: conditionMd ? renderMarkdown(conditionMd, resolver) : "",
      setup: fenceText(findFence(fences, "setup")),
      check,
      hint: fenceText(findFence(fences, "hint")) || null,
      solution: fenceText(findFence(fences, "solution")) || null,
      reviewHtml: review ? renderMarkdown(review, resolver) : null,
      notes: parseNotes(findFence(fences, "notes"), warn, block.title),
    });
  }
  return tasks.length ? { stand, lib, setup, tasks } : null;
}
