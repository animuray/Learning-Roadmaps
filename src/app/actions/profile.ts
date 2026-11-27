"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
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
