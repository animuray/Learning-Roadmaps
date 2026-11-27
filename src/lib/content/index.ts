import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { slugify } from "../translit";
import type { LinkResolver, TocItem } from "./markdown";
import { renderMarkdown } from "./markdown";
import { parseMaterials, parsePractice, parseQuiz, splitNote } from "./parse-topic";
import type { Material, Roadmap, RoadmapMode, Section, Topic, TopicRef } from "./types";

export * from "./types";

export const CONTENT_DIR = path.join(process.cwd(), "content");
const ROADMAPS_DIR = path.join(CONTENT_DIR, "roadmaps");
const ROADMAP_FILE = "roadmap.md";

/**
 * В production контент кешируется в памяти на CONTENT_CACHE_TTL секунд (по умолчанию 60):
 * после `git pull` в смонтированной папке content/ сайт обновится сам, без перезапуска.
 * В dev кеша нет — правки в Obsidian видны сразу.
 */
const cacheEnabled = process.env.NODE_ENV === "production";
const CACHE_TTL_MS = (Number(process.env.CONTENT_CACHE_TTL) || 60) * 1000;
let cacheBornAt = Date.now();
const roadmapCache = new Map<string, Roadmap | null>();
const topicCache = new Map<string, Topic | null>();

function freshCache() {
  if (Date.now() - cacheBornAt > CACHE_TTL_MS) {
    roadmapCache.clear();
    topicCache.clear();
    cacheBornAt = Date.now();
  }
}

/* ------------------------------------------------------------------ */
/* Заметки                                                             */
/* ------------------------------------------------------------------ */

type NoteIndex = Map<string, string>; // имя заметки (lower) → путь относительно CONTENT_DIR

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "_templates") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function indexNotes(roadmapDir: string): NoteIndex {
  const index: NoteIndex = new Map();
  for (const file of walk(roadmapDir)) {
    if (!file.endsWith(".md") || path.basename(file) === ROADMAP_FILE) continue;
    const rel = path.relative(CONTENT_DIR, file);
    const base = path.basename(file, ".md");
    index.set(base.toLowerCase(), rel);
    const { data } = parseNote(fs.readFileSync(file, "utf8"));
    const aliases: unknown[] = Array.isArray(data.aliases) ? data.aliases : [];
    for (const a of [data.title, ...aliases]) {
      if (typeof a === "string" && !index.has(a.toLowerCase())) index.set(a.toLowerCase(), rel);
    }
  }
  return index;
}

/**
 * Разбирает заметку. Если YAML во frontmatter битый (частая причина — «: » в значении
 * без кавычек), возвращает пустые данные, текст без frontmatter и описание ошибки.
 * Пустой объект опций отключает кэш gray-matter: с кэшем повторный вызов после ошибки
 * молча вернул бы пустые данные и необрезанный frontmatter в тексте.
 */
function parseNote(src: string): { data: Record<string, unknown>; content: string; error?: string } {
  try {
    const { data, content } = matter(src, {});
    return { data, content };
  } catch (e) {
    const content = src.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");
    const error = (e instanceof Error ? e.message : String(e)).split("\n")[0];
    return { data: {}, content, error };
  }
}

function readFrontmatter(rel: string): Record<string, unknown> {
  return parseNote(fs.readFileSync(path.join(CONTENT_DIR, rel), "utf8")).data;
}

/* ------------------------------------------------------------------ */
/* Роадмапы                                                            */
/* ------------------------------------------------------------------ */

const WIKI_ITEM = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/;
const OPTIONAL_TAG = /(^|\s)#(optional|необязательно|доп)\b/iu;

export function listRoadmapSlugs(): string[] {
  if (!fs.existsSync(ROADMAPS_DIR)) return [];
  return fs
    .readdirSync(ROADMAPS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(ROADMAPS_DIR, d.name, ROADMAP_FILE)))
    .map((d) => d.name);
}

export function getRoadmaps(): Roadmap[] {
  return listRoadmapSlugs()
    .map((s) => getRoadmap(s))
    .filter((r): r is Roadmap => !!r)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getRoadmap(slug: string): Roadmap | null {
  if (cacheEnabled) freshCache();
  if (cacheEnabled && roadmapCache.has(slug)) return roadmapCache.get(slug)!;
  const roadmap = loadRoadmap(slug);
  if (cacheEnabled) roadmapCache.set(slug, roadmap);
  return roadmap;
}

function loadRoadmap(slug: string): Roadmap | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const dir = path.join(ROADMAPS_DIR, slug);
  const file = path.join(dir, ROADMAP_FILE);
  if (!fs.existsSync(file)) return null;

  const { data, content } = parseNote(fs.readFileSync(file, "utf8"));
  const notes = indexNotes(dir);
  const sections: Section[] = [];
  const topics: TopicRef[] = [];
  const usedSlugs = new Set<string>();
  const missingNotes: string[] = [];
  let section: Section | null = null;
  let lastTopic: TopicRef | null = null;
  let inFence = false;
  let titleFromH1: string | null = null;

  const ensureSection = () => {
    if (!section) {
      section = { id: "main", title: "Основное", description: "", topics: [] };
      sections.push(section);
    }
    return section;
  };

  for (const raw of content.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h1 = raw.match(/^#\s+(.+)$/);
    if (h1) {
      titleFromH1 ??= h1[1].trim();
      continue;
    }
    const h2 = raw.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      const title = h2[1].trim();
      let id = slugify(title) || `section-${sections.length + 1}`;
      if (sections.some((s) => s.id === id)) id = `${id}-${sections.length + 1}`;
      section = { id, title, description: "", topics: [] };
      sections.push(section);
      lastTopic = null;
      continue;
    }

    const li = raw.match(/^(\s*)[-*+]\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (li) {
      const indent = li[1].replace(/\t/g, "    ").length;
      const text = li[2].trim();
      if (indent > 0 && lastTopic) {
        lastTopic.subtopics.push(cleanItem(text));
        continue;
      }
      const sec = ensureSection();
      const wiki = text.match(WIKI_ITEM);
      const target = (wiki ? wiki[1] : cleanItem(text)).trim();
      const notePath = notes.get(target.toLowerCase()) ?? null;
      if (wiki && !notePath) missingNotes.push(target);
      const fm = notePath ? readFrontmatter(notePath) : {};
      const title =
        wiki?.[2]?.trim() || (typeof fm.title === "string" ? fm.title : "") || target;
      let topicSlug = typeof fm.slug === "string" && fm.slug ? slugify(fm.slug) : slugify(target);
      if (!topicSlug) topicSlug = `topic-${topics.length + 1}`;
      if (usedSlugs.has(topicSlug)) topicSlug = `${topicSlug}-${topics.length + 1}`;
      usedSlugs.add(topicSlug);

      const ref: TopicRef = {
        slug: topicSlug,
        title,
        notePath,
        optional: OPTIONAL_TAG.test(text) || fm.optional === true,
        subtopics: [],
        sectionId: sec.id,
        index: topics.length,
      };
      sec.topics.push(ref);
      topics.push(ref);
      lastTopic = ref;
      continue;
    }

    if (raw.trim() && section) {
      section.description = [section.description, raw.trim()].filter(Boolean).join(" ");
    }
  }

  const mode: RoadmapMode = data.mode === "free" ? "free" : "sequential";
  return {
    slug,
    title: typeof data.title === "string" ? data.title : (titleFromH1 ?? slug),
    description: typeof data.description === "string" ? data.description : "",
    mode,
    passScore: num(data.passScore) ?? 80,
    order: num(data.order) ?? 100,
    sections: sections.filter((s) => s.topics.length > 0),
    topics,
    missingNotes,
  };
}

function cleanItem(text: string): string {
  return text
    .replace(WIKI_ITEM, (_m, target: string, alias?: string) => alias ?? target)
    .replace(OPTIONAL_TAG, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* Темы                                                                */
/* ------------------------------------------------------------------ */

export function makeResolver(roadmap: Roadmap): LinkResolver {
  const byName = new Map<string, string>();
  for (const t of roadmap.topics) {
    byName.set(t.title.toLowerCase(), t.slug);
    byName.set(t.slug, t.slug);
    if (t.notePath) {
      byName.set(path.basename(t.notePath, ".md").toLowerCase(), t.slug);
      const fm = readFrontmatter(t.notePath);
      const aliases: unknown[] = Array.isArray(fm.aliases) ? fm.aliases : [];
      for (const a of aliases) if (typeof a === "string") byName.set(a.toLowerCase(), t.slug);
    }
  }
  return {
    wikilink: (target) => {
      const slug = byName.get(target.trim().toLowerCase());
      return slug ? `/roadmaps/${roadmap.slug}/${slug}` : null;
    },
    embed: (file) => `/api/attachments/${encodeURIComponent(file.trim())}`,
  };
}

export function getTopic(roadmapSlug: string, topicSlug: string, warnings?: string[]): Topic | null {
  const key = `${roadmapSlug}/${topicSlug}`;
  if (cacheEnabled) freshCache();
  if (cacheEnabled && topicCache.has(key) && !warnings) return topicCache.get(key)!;
  const roadmap = getRoadmap(roadmapSlug);
  const ref = roadmap?.topics.find((t) => t.slug === topicSlug);
  if (!roadmap || !ref) return null;
  const topic = loadTopic(roadmap, ref, (m) => warnings?.push(m));
  if (cacheEnabled) topicCache.set(key, topic);
  return topic;
}

function loadTopic(roadmap: Roadmap, ref: TopicRef, warn: (m: string) => void): Topic {
  const resolver = makeResolver(roadmap);
  const base: Topic = {
    ...ref,
    roadmap: roadmap.slug,
    description: "",
    duration: null,
    level: null,
    hasNote: false,
    draft: true,
    bodyHtml: "",
    toc: [],
    materials: [],
    practiceIntroHtml: "",
    practice: [],
    quiz: [],
    quizSize: 0,
    passScore: roadmap.passScore,
  };
  if (!ref.notePath) return base;

  const note = parseNote(fs.readFileSync(path.join(CONTENT_DIR, ref.notePath), "utf8"));
  if (note.error) warn(`frontmatter не разобран (${note.error}) — значения с «: » возьмите в кавычки`);
  const { data, content } = note;
  const parts = splitNote(content);
  // Заголовок H1 в начале заметки дублирует название темы — убираем.
  const body = parts.body.replace(/^#\s+.+\n?/, "").trim();
  const toc: TocItem[] = [];
  const quiz = parts.quiz ? parseQuiz(parts.quiz, resolver, warn) : [];
  const practice = parts.practice ? parsePractice(parts.practice, resolver) : { introHtml: "", items: [] };

  const fmMaterials: Material[] = Array.isArray(data.materials)
    ? data.materials
        .map((m: unknown) => {
          if (typeof m === "string") return { title: m, url: m };
          if (m && typeof m === "object" && "url" in m) {
            const o = m as Record<string, unknown>;
            return {
              title: String(o.title ?? o.url),
              url: String(o.url),
              type: o.type ? String(o.type) : undefined,
              note: o.note ? String(o.note) : undefined,
            };
          }
          return null;
        })
        .filter((m: Material | null): m is Material => !!m && /^https?:\/\//.test(m.url))
    : [];

  const quizSize = Math.min(num(data.quizSize) ?? quiz.length, quiz.length);
  return {
    ...base,
    description: typeof data.description === "string" ? data.description : "",
    duration: num(data.duration),
    level: typeof data.level === "string" ? data.level : null,
    hasNote: true,
    draft: data.draft === true || (!body && quiz.length === 0),
    bodyHtml: body ? renderMarkdown(body, resolver, toc) : "",
    toc,
    materials: [...fmMaterials, ...(parts.materials ? parseMaterials(parts.materials) : [])],
    practiceIntroHtml: practice.introHtml,
    practice: practice.items,
    quiz,
    quizSize,
    passScore: num(data.passScore) ?? roadmap.passScore,
  };
}

/** Поиск файла-вложения (картинки) по имени во всей папке content/. */
export function findAttachment(name: string): string | null {
  const clean = path.basename(name.replace(/\\/g, "/"));
  if (!clean || clean.startsWith(".") || !/\.(png|jpe?g|gif|webp|svg|avif|pdf)$/i.test(clean)) return null;
  for (const file of walk(CONTENT_DIR)) {
    if (path.basename(file) === clean) return file;
  }
  return null;
}
