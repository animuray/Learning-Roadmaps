import Link from "next/link";
import { Route } from "lucide-react";
import { getReviewSummary } from "@/lib/review";
import { getCurrentUser } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export async function SiteHeader({ theme }: { theme: Theme }) {
  const user = await getCurrentUser();
  const due = user ? (await getReviewSummary(user.id)).due : 0;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
            <Route className="size-4.5" />
          </span>
          <span className="hidden sm:inline">Learning Roadmaps</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-4 overflow-x-auto whitespace-nowrap text-sm text-muted">
          {user && (
            <Link href="/learning" className="hover:text-fg">
              Моё обучение
            </Link>
          )}
          <Link href="/roadmaps" className="hover:text-fg">
            Каталог
          </Link>
          <Link href="/leaderboard" className="hover:text-fg">
            Лидеры
          </Link>
          {user && (
            <Link href="/review" className="flex items-center gap-1.5 hover:text-fg">
              Повторение
              {due > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-xs font-semibold leading-5 text-white">{due}</span>
              )}
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle initial={theme} />
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
