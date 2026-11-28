/**
 * Прогон задач лабораторий на стенде: npm run lab:check [roadmap] [фильтр по названию темы]
 *
 * Для каждой задачи:
 * 1. «Начать задачу» (setup) должна пройти без ошибок;
 * 2. проверка до решения должна НЕ проходить — иначе задача засчитывается без работы;
 * 3. эталонное решение выполняется от имени student (его код возврата не важен);
 * 4. после него проверка должна проходить.
 *
 * Нужен работающий стенд (LAB_SSH_HOST/LAB_SSH_PORT, для разработки — npm run lab:stand:wsl
 * и запущенный npm run lab:runner, который держит WSL-стенд включённым).
 */
import { getRoadmaps, getTopic } from "../src/lib/content";
import { checkTask, labConfig, startTask } from "../src/lib/lab";
import { execScript } from "../src/lib/lab/ssh";

const [onlyRoadmap, topicFilter] = process.argv.slice(2);
const config = labConfig();
if (!config) {
  console.error("Лаборатория не настроена: задайте LAB_SECRET и LAB_SSH_HOST в .env");
  process.exit(1);
}

let problems = 0;
let checked = 0;
for (const roadmap of getRoadmaps()) {
  if (onlyRoadmap && roadmap.slug !== onlyRoadmap) continue;
  for (const ref of roadmap.topics) {
    if (topicFilter && !ref.title.toLowerCase().includes(topicFilter.toLowerCase())) continue;
    const topic = getTopic(roadmap.slug, ref.slug);
    const lab = topic?.lab;
    if (!lab) continue;
    console.log(`\n${roadmap.slug} / ${topic.title}`);
    for (const task of lab.tasks) {
      const bad = (msg: string, detail?: string) => {
        problems++;
        console.log(`  ✗ «${task.title}»: ${msg}`);
        if (detail) console.log(detail.trim().split("\n").slice(0, 8).map((l) => `      ${l}`).join("\n"));
      };
      if (!task.solution) {
        bad("нет блока ```bash solution — нечем проверить задачу");
        continue;
      }
      checked++;
      // Стенд под нагрузкой иногда не отвечает на SSH — это не повод обрывать весь прогон.
      try {
        const st = await startTask(config.stand, lab, task);
        if (!st.ok) {
          bad("подготовка (setup) завершилась с ошибкой", st.output);
          continue;
        }
        const before = await checkTask(config.stand, lab, task);
        if (before.passed) {
          bad("проверка проходит ещё до решения", before.output);
          continue;
        }
        // Код возврата решения не важен (find с недоступными каталогами вернёт 1) — важен результат.
        const sol = await execScript(config.stand, "student", task.solution, 300_000);
        const after = await checkTask(config.stand, lab, task);
        if (!after.passed) {
          bad(
            "после эталонного решения проверка не проходит",
            `${after.output}\n--- вывод решения (код ${sol.code}):\n${sol.stdout}${sol.stderr}`,
          );
          continue;
        }
        console.log(`  ✓ ${task.title}`);
      } catch (e) {
        bad("стенд не ответил", e instanceof Error ? e.message : String(e));
      }
    }
  }
}

console.log(`\nПроверено задач: ${checked}. ${problems ? `Проблем: ${problems}` : "Ошибок нет"}`);
process.exit(problems ? 1 : 0);
