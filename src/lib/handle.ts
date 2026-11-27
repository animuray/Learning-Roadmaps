import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { slugify } from "./translit";

export const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

/** Выдаёт пользователю уникальный handle для адреса профиля /u/<handle>, если его ещё нет. */
export async function ensureHandle(userId: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("user not found");
  if (user.handle) return user.handle;

  const base =
    slugify(user.email?.split("@")[0] ?? "") || slugify(user.name ?? "") || "user";
  let candidate = base.slice(0, 24).padEnd(3, "0");
  for (let i = 0; i < 50; i++) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.handle, candidate));
    if (!taken) break;
    candidate = `${base.slice(0, 20)}${Math.floor(Math.random() * 9000 + 1000)}`;
  }
  await db.update(users).set({ handle: candidate }).where(eq(users.id, userId));
  return candidate;
}
