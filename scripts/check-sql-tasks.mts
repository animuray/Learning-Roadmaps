/**
 * Прогон задач SQL-тренажёра в песочнице: npm run sql:check [roadmap]
 *
 * Для каждой задачи:
 * - эталонное решение (```sql solution) должно пройти проверку;
 * - пустой запрос (`SELECT 1 WHERE false`) не должен её проходить — иначе
 *   задача засчитывается без решения (например, check state, который
 *   и так возвращает строки).
 * Задачи без решения отмечаются предупреждением: их нечем проверить.
 */
import { getRoadmaps, getTopic } from "../src/lib/content";
import { runSqlTask } from "../src/lib/sql-practice";

const only = process.argv[2];
let problems = 0;
let checked = 0;

for (const roadmap of getRoadmaps()) {
  if (only && roadmap.slug !== only) continue;
  for (const t of roadmap.topics) {
    const topic = getTopic(roadmap.slug, t.slug);
    if (!topic?.tasks.length) continue;
    console.log(`\n${roadmap.slug} / ${topic.title}`);
    for (const task of topic.tasks) {
      if (!task.solution) {
        problems++;
        console.log(`  ⚠ «${task.title}»: нет блока \`\`\`sql solution — нечем проверить задачу`);
        continue;
      }
      checked++;
      const good = await runSqlTask(task, task.solution);
      const empty = await runSqlTask(task, "SELECT 1 WHERE false");
      if (!good.passed) {
        problems++;
        console.log(`  ✗ «${task.title}»: эталонное решение не проходит проверку`);
        if (good.error) console.log(`      ${good.error.split("\n")[0]}`);
      } else if (empty.passed) {
        problems++;
        console.log(`  ✗ «${task.title}»: проверку проходит даже пустой запрос`);
      } else {
        console.log(`  ✓ ${task.title}`);
      }
    }
  }
}

console.log(`\nПроверено задач: ${checked}. ${problems ? `Проблем: ${problems}` : "Ошибок нет"}`);
process.exit(problems ? 1 : 0);
