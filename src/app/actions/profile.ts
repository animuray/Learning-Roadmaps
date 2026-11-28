"use server";

import { and, eq, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { userAvatars, users } from "@/db/schema";
import { HANDLE_RE } from "@/lib/handle";
import { getCurrentUser } from "@/lib/session";
import type { FormState } from "./learning";

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const schema = z.object({
  name: z.string().trim().min(1, "Укажите имя").max(80),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HANDLE_RE, "Адрес профиля: 3–30 символов, латиница, цифры, - и _"),
  bio: opt(500),
  telegram: opt(64).transform((v) => (v ? v.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "") : v)),
  github: opt(64).transform((v) => (v ? v.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "") : v)),
  website: opt(300).refine((v) => !v || /^https?:\/\//.test(v), "Сайт должен начинаться с https://"),
  isPublic: z.boolean(),
});

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    handle: formData.get("handle") ?? "",
    bio: formData.get("bio") ?? "",
    telegram: formData.get("telegram") ?? "",
    github: formData.get("github") ?? "",
    website: formData.get("website") ?? "",
    isPublic: formData.get("isPublic") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.handle, parsed.data.handle), ne(users.id, user.id)));
  if (taken) return { error: "Этот адрес профиля уже занят" };

  await db.update(users).set(parsed.data).where(eq(users.id, user.id));
  redirect(`/u/${parsed.data.handle}`);
}

/* ------------------------------- аватарка ------------------------------- */

/** Браузер присылает уже обрезанную и уменьшенную картинку (256×256), так что 512 КБ — с запасом. */
const AVATAR_MAX_BYTES = 512 * 1024;

/** Тип картинки по первым байтам: заголовку Content-Type от браузера не доверяем, SVG не принимаем вовсе. */
function imageMime(b: Buffer): string | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function uploadAvatar(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "Выберите картинку" };
  if (file.size > AVATAR_MAX_BYTES) return { error: "Картинка слишком большая" };
  const data = Buffer.from(await file.arrayBuffer());
  const mime = imageMime(data);
  if (!mime) return { error: "Нужна картинка PNG, JPEG или WebP" };

  const now = new Date();
  await db
    .insert(userAvatars)
    .values({ userId: user.id, mime, data, updatedAt: now })
    .onConflictDoUpdate({ target: userAvatars.userId, set: { mime, data, updatedAt: now } });
  // ?v= — чтобы браузер не показывал старую картинку из кеша
  await db.update(users).set({ image: `/api/avatar/${user.id}?v=${now.getTime()}` }).where(eq(users.id, user.id));
  refresh();
  return { ok: true };
}

/** Убрать аватарку: вместо неё снова инициалы. */
export async function removeAvatar(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await db.delete(userAvatars).where(eq(userAvatars.userId, user.id));
  await db.update(users).set({ image: null }).where(eq(users.id, user.id));
  refresh();
}
