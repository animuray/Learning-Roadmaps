import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { enrollments } from "@/db/schema";

export type Enrollment = typeof enrollments.$inferSelect;

/** Все записи пользователя, свежие сверху. */
export async function getEnrollments(userId: string): Promise<Enrollment[]> {
  return db.select().from(enrollments).where(eq(enrollments.userId, userId)).orderBy(desc(enrollments.lastOpenedAt));
}

export async function getEnrollment(userId: string, roadmap: string): Promise<Enrollment | null> {
  const [row] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.roadmap, roadmap)));
  return row ?? null;
}

/** Записаться (или вернуть из архива). */
export async function enroll(userId: string, roadmap: string): Promise<void> {
  const now = new Date();
  await db
    .insert(enrollments)
    .values({ userId, roadmap, status: "active", enrolledAt: now, lastOpenedAt: now })
    .onConflictDoUpdate({
      target: [enrollments.userId, enrollments.roadmap],
      set: { status: "active", lastOpenedAt: now },
    });
}

export async function setArchived(userId: string, roadmap: string, archived: boolean): Promise<void> {
  await db
    .update(enrollments)
    .set({ status: archived ? "archived" : "active" })
    .where(and(eq(enrollments.userId, userId), eq(enrollments.roadmap, roadmap)));
}

/** Отметить, что пользователь открыл роадмап: для карточки «Продолжить». */
export async function touchEnrollment(userId: string, roadmap: string): Promise<void> {
  await db
    .update(enrollments)
    .set({ lastOpenedAt: new Date() })
    .where(and(eq(enrollments.userId, userId), eq(enrollments.roadmap, roadmap)));
}
