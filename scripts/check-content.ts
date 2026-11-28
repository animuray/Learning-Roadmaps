/**
 * Проверка контента: npm run content:check
 * Показывает статистику роадмапов, темы без заметок и ошибки в тестах.
 */
import { getRoadmaps, getTopic } from "../src/lib/content";

let problems = 0;
const roadmaps = getRoadmaps();
if (roadmaps.length === 0) {
  console.log("Роадмапов не найдено: нужна папка content/roadmaps/<slug>/roadmap.md");
  process.exit(1);
}

for (const r of roadmaps) {
  let withNote = 0;
  let withQuiz = 0;
  let questions = 0;
  let withTrainer = 0;
  let tasks = 0;
  let withLab = 0;
  let labTasks = 0;
  for (const t of r.topics) {
    const warnings: string[] = [];
    const topic = getTopic(r.slug, t.slug, warnings);
    if (!topic) continue;
    if (topic.hasNote) withNote++;
    if (topic.quiz.length) withQuiz++;
    questions += topic.quiz.length;
    if (topic.tasks.length) withTrainer++;
    tasks += topic.tasks.length;
    if (topic.lab) withLab++;
    labTasks += topic.lab?.tasks.length ?? 0;
    for (const w of warnings) {
      problems++;
      console.log(`  ⚠ ${t.title}: ${w}`);
    }
    if (topic.quiz.length && topic.quiz.length < topic.quizSize) {
      problems++;
      console.log(`  ⚠ ${t.title}: quizSize больше, чем вопросов в банке`);
    }
  }
  console.log(`\n${r.title}  [${r.slug}, режим: ${r.mode}]`);
  console.log(`  разделов: ${r.sections.length}, тем: ${r.topics.length}`);
  console.log(`  с конспектом: ${withNote}, с тестом: ${withQuiz}, вопросов всего: ${questions}`);
  console.log(`  с тренажёром: ${withTrainer}, задач тренажёра: ${tasks}`);
  console.log(`  с лабораторией: ${withLab}, задач лабораторий: ${labTasks}`);
  if (r.missingNotes.length) {
    console.log(`  заметок ещё нет: ${r.missingNotes.length} (это нормально — темы без конспекта отмечаются вручную)`);
  }
}
console.log(problems ? `\nНайдено проблем: ${problems}` : "\nОшибок нет");
process.exit(problems ? 1 : 0);
