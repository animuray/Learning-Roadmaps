import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAvatars, users } from "@/db/schema";

/** Браузер присылает уже обрезанную и уменьшенную картинку (256×256), так что 512 КБ — с запасом. */
const AVATAR_MAX_BYTES = 512 * 1024;

/** Тип картинки по первым байтам: заголовку Content-Type от браузера не доверяем, SVG не принимаем вовсе. */
function imageMime(b: Buffer): string | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Проверяет картинку. Ошибка — текстом для пользователя, иначе данные для сохранения. */
export async function readAvatar(file: File): Promise<{ error: string } | { mime: string; data: Buffer }> {
  if (file.size > AVATAR_MAX_BYTES) return { error: "Картинка слишком большая" };
  const data = Buffer.from(await file.arrayBuffer());
  const mime = imageMime(data);
  if (!mime) return { error: "Нужна картинка PNG, JPEG или WebP" };
  return { mime, data };
}

/** Сохраняет аватарку и ставит users.image на неё. */
export async function saveAvatar(userId: string, avatar: { mime: string; data: Buffer }): Promise<void> {
  const now = new Date();
  await db
    .insert(userAvatars)
    .values({ userId, ...avatar, updatedAt: now })
    .onConflictDoUpdate({ target: userAvatars.userId, set: { ...avatar, updatedAt: now } });
  // ?v= — чтобы браузер не показывал старую картинку из кеша
  await db.update(users).set({ image: `/api/avatar/${userId}?v=${now.getTime()}` }).where(eq(users.id, userId));
}
