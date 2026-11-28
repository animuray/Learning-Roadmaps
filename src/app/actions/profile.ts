"use server";

import { and, eq, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { userAvatars, users } from "@/db/schema";
import { readAvatar, saveAvatar } from "@/lib/avatar";
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

export async function uploadAvatar(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "Выберите картинку" };
  const avatar = await readAvatar(file);
  if ("error" in avatar) return avatar;
  await saveAvatar(user.id, avatar);
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
