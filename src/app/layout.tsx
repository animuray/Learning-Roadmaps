import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Learning Roadmaps",
    template: "%s — Learning Roadmaps",
  },
  description: "Обучение по роадмапам: конспекты, тесты, практика и прогресс.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line py-6 text-center text-sm text-muted">
          Learning Roadmaps · учусь сам и делюсь знаниями
        </footer>
      </body>
    </html>
  );
}
