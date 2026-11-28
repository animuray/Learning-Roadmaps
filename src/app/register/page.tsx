import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Route } from "lucide-react";
import { RegisterForm } from "@/components/auth/password-forms";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const raw = typeof sp.callbackUrl === "string" ? sp.callbackUrl : "/";
  const callbackUrl = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  if (await getCurrentUser()) redirect(callbackUrl);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-3xl border border-line bg-surface p-8">
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-accent text-white">
            <Route className="size-6" />
          </span>
          <h1 className="mt-4 text-2xl font-bold">Регистрация</h1>
          <p className="mt-2 text-sm text-muted">Прогресс, тесты, заметки и активность будут сохраняться в вашем профиле.</p>
        </div>
        <div className="mt-6">
          <RegisterForm callbackUrl={callbackUrl} />
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          Уже есть аккаунт?{" "}
          <Link
            href={callbackUrl === "/" ? "/login" : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-medium text-accent hover:underline"
          >
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
