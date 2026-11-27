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
