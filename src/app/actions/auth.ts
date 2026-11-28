"use server";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { readAvatar, saveAvatar } from "@/lib/avatar";
import { HANDLE_RE } from "@/lib/handle";
import { hashPassword, PASSWORD_MIN } from "@/lib/password";
import type { FormState } from "./learning";

function safeRedirect(url: FormDataEntryValue | null): string {
  const s = typeof url === "string" ? url : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safeRedirect(formData.get("callbackUrl")) });
}

export async function signInDev(formData: FormData) {
  await signIn("dev", {
    email: String(formData.get("email") ?? ""),
    redirectTo: safeRedirect(formData.get("callbackUrl")),
  });
}

/** Вход по логину и паролю. При успехе signIn делает redirect (исключение NEXT_REDIRECT пробрасываем дальше). */
async function passwordSignIn(login: string, password: string, redirectTo: string): Promise<FormState> {
  try {
    await signIn("password", { login, password, redirectTo });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Неверный логин или пароль (или слишком много попыток — подождите 15 минут)" };
    throw e;
  }
  return null;
}

export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  return passwordSignIn(
    String(formData.get("login") ?? ""),
    String(formData.get("password") ?? ""),
    safeRedirect(formData.get("callbackUrl")),
  );
}

const registerSchema = z
  .object({
    login: z
      .string()
      .trim()
      .toLowerCase()
      .regex(HANDLE_RE, "Логин: 3–30 символов — латиница, цифры, - и _, начинается с буквы или цифры"),
    name: z.string().trim().min(1, "Укажите имя").max(80, "Имя слишком длинное"),
    password: z.string().min(PASSWORD_MIN, `Пароль — не короче ${PASSWORD_MIN} символов`).max(200),
    password2: z.string(),
  })
  .refine((d) => d.password === d.password2, { message: "Пароли не совпадают" });

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    login: formData.get("login") ?? "",
    name: formData.get("name") ?? "",
    password: formData.get("password") ?? "",
    password2: formData.get("password2") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const { login, name, password } = parsed.data;

  // Аватарку проверяем до создания пользователя, чтобы ошибка в картинке не оставила полуготовую учётную запись.
  const file = formData.get("avatar");
  let avatar: Awaited<ReturnType<typeof readAvatar>> | null = null;
  if (file instanceof File && file.size > 0) {
    avatar = await readAvatar(file);
    if ("error" in avatar) return avatar;
  }

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.handle, login));
  if (taken) return { error: "Этот логин уже занят" };

  const [user] = await db
    .insert(users)
    .values({ handle: login, name, passwordHash: await hashPassword(password) })
    .onConflictDoNothing({ target: users.handle })
    .returning({ id: users.id });
  if (!user) return { error: "Этот логин уже занят" };
  if (avatar && !("error" in avatar)) await saveAvatar(user.id, avatar);

  return passwordSignIn(login, password, safeRedirect(formData.get("callbackUrl")));
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
