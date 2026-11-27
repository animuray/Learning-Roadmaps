import fs from "node:fs";
import path from "node:path";
import { findAttachment } from "@/lib/content";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
};

/** Отдаёт картинки из content/ для встраиваний Obsidian вида ![[схема.png]]. */
export async function GET(_req: Request, ctx: RouteContext<"/api/attachments/[name]">) {
  const { name } = await ctx.params;
  const file = findAttachment(decodeURIComponent(name));
  if (!file) return new Response("Not found", { status: 404 });
  const data = await fs.promises.readFile(file);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
