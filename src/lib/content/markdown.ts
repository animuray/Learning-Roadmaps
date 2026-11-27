import { unified, type Plugin } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { visit, SKIP } from "unist-util-visit";
import type { Root as MdRoot, PhrasingContent, Paragraph, Blockquote, Text } from "mdast";
import type { Root as HRoot, Element } from "hast";

export type LinkResolver = {
  /** [[Заметка]] → URL темы или null, если такой темы нет */
  wikilink: (target: string) => string | null;
  /** ![[картинка.png]] → URL файла */
  embed: (file: string) => string;
};

const WIKI_RE = /(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
const HIGHLIGHT_RE = /==([^=\n]+)==/g;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

/** Obsidian-синтаксис: [[ссылки]], ![[вложения]], ==выделение==, > [!note] callout */
const remarkObsidian: Plugin<[LinkResolver], MdRoot> = (resolver) => (tree) => {
  visit(tree, "text", (node: Text, index, parent) => {
    if (!parent || index === undefined) return;
    if (!node.value.includes("[[") && !node.value.includes("==")) return;

    const out: PhrasingContent[] = [];
    let last = 0;
    const value = node.value;
    const matches = [...value.matchAll(WIKI_RE)];
    for (const m of matches) {
      const start = m.index ?? 0;
      if (start > last) out.push(...splitHighlights(value.slice(last, start)));
      const [, bang, rawTarget, , alias] = m;
      const target = rawTarget.trim();
      if (bang) {
        const src = resolver.embed(target);
        if (IMAGE_EXT.test(target)) {
          out.push({ type: "image", url: src, alt: alias ?? target });
        } else {
          out.push({ type: "link", url: src, children: [{ type: "text", value: alias ?? target }] });
        }
      } else {
        const href = resolver.wikilink(target);
        const label = alias?.trim() || target;
        if (href) {
          out.push({ type: "link", url: href, children: [{ type: "text", value: label }] });
        } else {
          out.push({
            type: "emphasis",
            data: { hProperties: { className: ["wikilink-missing"], title: "Заметка ещё не создана" } },
            children: [{ type: "text", value: label }],
          });
        }
      }
      last = start + m[0].length;
    }
    if (last < value.length) out.push(...splitHighlights(value.slice(last)));
    parent.children.splice(index, 1, ...out);
    return [SKIP, index + out.length];
  });

  // Callouts: > [!note] Заголовок
  visit(tree, "blockquote", (node: Blockquote) => {
    const first = node.children[0] as Paragraph | undefined;
    if (!first || first.type !== "paragraph") return;
    const head = first.children[0];
    if (!head || head.type !== "text") return;
    const m = head.value.match(/^\[!([a-zA-Z]+)\][+-]?\s*([^\n]*)\n?/);
    if (!m) return;
    const kind = m[1].toLowerCase();
    const title = m[2].trim() || CALLOUT_TITLES[kind] || kind;
    head.value = head.value.slice(m[0].length);
    if (!head.value) first.children.shift();
    if (first.children.length === 0) node.children.shift();
    node.data = { hName: "div", hProperties: { className: ["callout", `callout-${kind}`] } };
    node.children.unshift({
      type: "paragraph",
      data: { hProperties: { className: ["callout-title"] } },
      children: [{ type: "text", value: title }],
    });
  });
};

function splitHighlights(text: string): PhrasingContent[] {
  if (!text.includes("==")) return [{ type: "text", value: text }];
  const out: PhrasingContent[] = [];
  let last = 0;
  for (const m of text.matchAll(HIGHLIGHT_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", value: text.slice(last, start) });
    out.push({
      type: "emphasis",
      data: { hName: "mark" },
      children: [{ type: "text", value: m[1] }],
    });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

const CALLOUT_TITLES: Record<string, string> = {
  note: "Заметка",
  info: "Информация",
  tip: "Совет",
  hint: "Подсказка",
  important: "Важно",
  warning: "Внимание",
  caution: "Осторожно",
  danger: "Опасно",
  example: "Пример",
  question: "Вопрос",
  quote: "Цитата",
  abstract: "Кратко",
  summary: "Итог",
  success: "Готово",
  bug: "Ошибка",
};

/** Внешние ссылки открываются в новой вкладке; собираем оглавление по h2/h3. */
const rehypeExtras: Plugin<[{ toc?: TocItem[] }], HRoot> = (opts) => (tree) => {
  visit(tree, "element", (node: Element) => {
    if (node.tagName === "a") {
      const href = String(node.properties?.href ?? "");
      if (/^https?:\/\//.test(href)) {
        node.properties = { ...node.properties, target: "_blank", rel: ["noopener", "noreferrer"] };
      }
    }
    if (opts.toc && (node.tagName === "h2" || node.tagName === "h3")) {
      const id = String(node.properties?.id ?? "");
      if (id) opts.toc.push({ id, title: textOf(node), depth: node.tagName === "h2" ? 2 : 3 });
    }
  });
};

export type TocItem = { id: string; title: string; depth: number };

function textOf(node: Element | HRoot): string {
  let s = "";
  visit(node, "text", (t: { value: string }) => {
    s += t.value;
  });
  return s;
}

export function renderMarkdown(md: string, resolver: LinkResolver, toc?: TocItem[]): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, resolver)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeHighlight, { detect: false, ignoreMissing: true } as never)
    .use(rehypeExtras, { toc })
    .use(rehypeStringify)
    .processSync(md);
  return String(file);
}

/** Для коротких фрагментов (варианты ответа, пункты практики) — без обёртки <p>. */
export function renderInline(md: string, resolver: LinkResolver): string {
  const html = renderMarkdown(md, resolver).trim();
  const m = html.match(/^<p>([\s\S]*)<\/p>$/);
  return m && !m[1].includes("<p>") ? m[1] : html;
}
