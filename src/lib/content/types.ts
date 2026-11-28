export type RoadmapMode = "sequential" | "free";

export type Material = {
  title: string;
  url: string;
  type?: string;
  note?: string;
};

export type TopicRef = {
  /** Ключ темы в URL и в базе. Берётся из frontmatter `slug` или из имени заметки. */
  slug: string;
  title: string;
  /** Путь к заметке относительно папки content/ или null, если заметки ещё нет. */
  notePath: string | null;
  /** Необязательная тема не блокирует следующие. Отмечается тегом #optional в roadmap.md */
  optional: boolean;
  subtopics: string[];
  sectionId: string;
  /** Порядковый номер темы в роадмапе (с 0). */
  index: number;
};

export type Section = {
  id: string;
  title: string;
  description: string;
  topics: TopicRef[];
};

export type Roadmap = {
  slug: string;
  title: string;
  description: string;
  mode: RoadmapMode;
  passScore: number;
  order: number;
  sections: Section[];
  topics: TopicRef[];
  /** Заметки, на которые есть ссылка в roadmap.md, но файла пока нет. */
  missingNotes: string[];
};

export type QuestionType = "single" | "multiple" | "text";

export type Question = {
  id: string;
  type: QuestionType;
  titleHtml: string;
  bodyHtml: string;
  options: { id: number; html: string; correct: boolean }[];
  answers: string[];
  explanationHtml: string;
};

export type PracticeItem = { key: string; html: string };

/**
 * Проверка задачи SQL-тренажёра:
 * - `rows` — сравнение строк результата с эталонным запросом;
 * - `state` — после запроса ученика выполняется контрольный запрос: задача
 *   засчитывается, если он вернул хотя бы одну строку (для INSERT/UPDATE/DELETE);
 * - `regex` — регулярка по тексту результата.
 */
export type SqlCheck =
  | { kind: "rows"; sql: string; ordered: boolean }
  | { kind: "state"; sql: string }
  | { kind: "regex"; pattern: string };

/** Задача интерактивного SQL-тренажёра (раздел «## Тренажёр» в заметке темы). */
export type SqlTask = {
  /** Ключ в URL и в базе решений. Считается из заголовка задачи. */
  key: string;
  title: string;
  conditionHtml: string;
  /** SQL-данные задачи: схема и наполнение, выполняются перед запросом пользователя. */
  seed: string;
  check: SqlCheck;
  hint: string | null;
  solution: string | null;
  /** Разбор эталона — показывается после решения. */
  reviewHtml: string | null;
  notes: SolutionNote[];
};

/** Задача тренажёра в том виде, в каком она уходит в браузер: без проверки, разбора и замечаний. */
export type PublicSqlTask = Omit<SqlTask, "check" | "reviewHtml" | "notes">;

/** Замечание к решению: если код ученика подходит под шаблон — показать объяснение. */
export type SolutionNote = { pattern: string; message: string };

/**
 * Задача лаборатории (раздел «## Лаборатория»): ученик работает в терминале стенда,
 * проверка — bash-скрипт от root, код возврата 0 — задача решена.
 */
export type LabTask = {
  key: string;
  title: string;
  conditionHtml: string;
  /** Подготовка стенда к задаче (root). Выполняется кнопкой «Начать задачу». */
  setup: string;
  /** Проверка (root): код возврата 0 — решено, вывод показывается ученику. */
  check: string;
  hint: string | null;
  /** Эталонное решение — команды, выполняемые от имени student. */
  solution: string | null;
  reviewHtml: string | null;
  notes: SolutionNote[];
};

export type PublicLabTask = Pick<LabTask, "key" | "title" | "conditionHtml" | "hint" | "solution">;

export type Lab = {
  /** Шаблон стенда: linux (по умолчанию). Определяет, где открывается терминал. */
  stand: string;
  /** Общие функции для подготовки и проверок — блок ```bash lib до первой задачи. */
  lib: string;
  /** Общая подготовка для всех задач темы — блок ```bash setup до первой задачи. */
  setup: string;
  tasks: LabTask[];
};

export type Topic = TopicRef & {
  roadmap: string;
  description: string;
  duration: number | null;
  level: string | null;
  hasNote: boolean;
  draft: boolean;
  bodyHtml: string;
  toc: { id: string; title: string; depth: number }[];
  materials: Material[];
  practiceIntroHtml: string;
  practice: PracticeItem[];
  /** Задачи интерактивного SQL-тренажёра (пусто, если раздела «Тренажёр» нет). */
  tasks: SqlTask[];
  /** Лаборатория с терминалом (null, если раздела «Лаборатория» нет). */
  lab: Lab | null;
  quiz: Question[];
  /** Сколько вопросов показывать за попытку (случайная выборка из банка). */
  quizSize: number;
  passScore: number;
};

/** Вопрос в том виде, в каком он уходит в браузер: без правильных ответов. */
export type PublicQuestion = {
  id: string;
  type: QuestionType;
  titleHtml: string;
  bodyHtml: string;
  options: { id: number; html: string }[];
};
