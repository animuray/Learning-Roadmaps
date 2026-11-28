import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAvatars } from "@/db/schema";

/** Отдаёт загруженную аватарку. Версия в ?v= меняется при каждой загрузке, поэтому кеш долгий. */
export async function GET(_req: Request, ctx: RouteContext<"/api/avatar/[id]">) {
  const { id } = await ctx.params;
  const [avatar] = await db
    .select({ mime: userAvatars.mime, data: userAvatars.data })
    .from(userAvatars)
    .where(eq(userAvatars.userId, id));
  if (!avatar) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(avatar.data), {
    headers: {
      "Content-Type": avatar.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
