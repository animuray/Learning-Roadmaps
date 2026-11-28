import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  handle: string | null;
};

/** Текущий пользователь или null. Кешируется на время одного запроса. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Старая кука, подписанная другим AUTH_SECRET, даёт JWTSessionError вместо null.
  // Такую сессию считаем отсутствующей, а не роняем страницу.
  const session = await auth().catch((error: unknown) => {
    console.warn("[auth] не удалось прочитать сессию, пользователь не авторизован:", error);
    return null;
  });
  const id = session?.user?.id;
  if (!id) return null;
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image, handle: users.handle })
    .from(users)
    .where(eq(users.id, id));
  return user ?? null;
});

export async function requireUser(callbackUrl?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  }
  return user;
}
