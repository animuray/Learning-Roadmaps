import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Route } from "lucide-react";
import { signInDev, signInWithGoogle } from "@/app/actions/auth";
import { devLoginEnabled } from "@/auth";
import { LoginForm } from "@/components/auth/password-forms";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const callbackUrl = typeof sp.callbackUrl === "string" ? sp.callbackUrl : "/";
  if (await getCurrentUser()) redirect(callbackUrl.startsWith("/") ? callbackUrl : "/");
  const googleConfigured = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-3xl border border-line bg-surface p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-accent text-white">
          <Route className="size-6" />
        </span>
        <h1 className="mt-4 text-2xl font-bold">Вход в Learning Roadmaps</h1>
        <p className="mt-2 text-sm text-muted">Прогресс, тесты, заметки и активность сохраняются в вашем профиле.</p>

        {error && (
          <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm text-danger">Не удалось войти ({error}). Попробуйте ещё раз.</p>
        )}

        <div className="mt-6">
          <LoginForm callbackUrl={callbackUrl} />
        </div>
        <p className="mt-4 text-sm text-muted">
          Нет аккаунта?{" "}
          <Link
            href={callbackUrl === "/" ? "/register" : `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-medium text-accent hover:underline"
          >
            Зарегистрироваться
          </Link>
        </p>

        <div className="mt-6 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" /> или <span className="h-px flex-1 bg-line" />
        </div>

        <form action={signInWithGoogle} className="mt-6">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button
            disabled={!googleConfigured}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 font-medium hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GoogleIcon /> Войти через Google
          </button>
        </form>
        {!googleConfigured && (
          <p className="mt-3 text-xs text-muted">
            Google-вход не настроен: задайте AUTH_GOOGLE_ID и AUTH_GOOGLE_SECRET (см. README).
          </p>
        )}

        {devLoginEnabled && (
          <form action={signInDev} className="mt-6 border-t border-line pt-6 text-left">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <label className="text-xs font-medium text-muted">Dev-вход (DEV_LOGIN=true, только для разработки)</label>
            <div className="mt-2 flex gap-2">
              <input
                name="email"
                type="email"
                required
                defaultValue="dev@example.com"
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
              />
              <button className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white">Войти</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
