import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/site-header";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Learning Roadmaps",
    template: "%s — Learning Roadmaps",
  },
  description: "Обучение по роадмапам: конспекты, тесты, практика и прогресс.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="ru" className="h-full antialiased" data-theme={theme === "system" ? undefined : theme}>
      <body className="min-h-full flex flex-col">
        <SiteHeader theme={theme} />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line py-6 text-center text-sm text-muted">
          Learning Roadmaps · учусь сам и делюсь знаниями
        </footer>
      </body>
    </html>
  );
}
