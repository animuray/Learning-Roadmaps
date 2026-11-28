import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { AvatarForm } from "@/components/profile/avatar-form";
import { SettingsForm } from "@/components/profile/settings-form";

export const metadata: Metadata = { title: "Настройки профиля" };

export default async function SettingsPage() {
  const current = await requireUser("/settings");
  const [user] = await db.select().from(users).where(eq(users.id, current.id));
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Настройки профиля</h1>
      <p className="mt-1 text-muted">Эти данные видны на вашей публичной странице.</p>
      <AvatarForm name={user.name ?? user.handle ?? "?"} image={user.image} />
      <SettingsForm
        initial={{
          name: user.name ?? "",
          handle: user.handle ?? "",
          bio: user.bio ?? "",
          telegram: user.telegram ?? "",
          github: user.github ?? "",
          website: user.website ?? "",
          isPublic: user.isPublic,
          email: user.email ?? "",
        }}
      />
    </div>
  );
}
