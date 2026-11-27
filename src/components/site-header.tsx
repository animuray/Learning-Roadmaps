import Link from "next/link";
import { Route } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
            <Route className="size-4.5" />
          </span>
          <span className="hidden sm:inline">Learning Roadmaps</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link href="/roadmaps" className="hover:text-fg">
            Роадмапы
          </Link>
        </nav>
        <div className="ml-auto">
          {user ? (
            <UserMenu
              name={user.name ?? user.email ?? "Профиль"}
              image={user.image}
              profileHref={`/u/${user.handle ?? user.id}`}
            />
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
