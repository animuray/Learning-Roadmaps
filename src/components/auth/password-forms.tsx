"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { register, signInWithPassword } from "@/app/actions/auth";
import type { FormState } from "@/app/actions/learning";
import { Avatar } from "@/components/avatar";
import { squareImage } from "@/lib/square-image";

const input = "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

// После отправки React сбрасывает неуправляемые поля формы, поэтому то, что жалко вводить заново
// при ошибке (логин, имя, картинку), держим в состоянии. Пароли сбрасываются — это нормально.

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [login, setLogin] = useState("");
  const [state, action, pending] = useActionState(signInWithPassword, null);
  return (
    <form action={action} className="space-y-3 text-left">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Field label="Логин">
        <input
          name="login"
          required
          autoComplete="username"
          autoCapitalize="none"
          className={input}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />
      </Field>
      <Field label="Пароль">
        <input name="password" type="password" required autoComplete="current-password" className={input} />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-white hover:opacity-90 disabled:opacity-60">
        {pending ? "Вхожу…" : "Войти"}
      </button>
    </form>
  );
}

export function RegisterForm({ callbackUrl }: { callbackUrl: string }) {
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [avatar, setAvatar] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData): Promise<FormState> => {
    if (avatar) fd.set("avatar", new File([avatar], "avatar", { type: avatar.type }));
    return register(prev, fd);
  }, null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // Картинку сразу обрезаем до квадрата 256×256 — как в настройках профиля.
  async function onFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    setAvatarError(null);
    try {
      const blob = await squareImage(file);
      setAvatar(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setAvatarError("Не удалось открыть картинку. Подойдёт JPEG, PNG или WebP.");
    }
  }

  return (
    <form action={action} className="space-y-3 text-left">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} image={preview} size={64} />
        <div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <ImageUp className="size-4" /> {preview ? "Другое фото" : "Загрузить аватарку"}
          </button>
          <p className="mt-1 text-xs text-muted">Необязательно. Обрежется до квадрата по центру.</p>
          {avatarError && <p className="mt-1 text-xs text-danger">{avatarError}</p>}
        </div>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <Field label="Имя" hint="Так вас увидят в профиле и рейтинге.">
        <input
          name="name"
          required
          maxLength={80}
          autoComplete="name"
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Логин" hint="Латиница, цифры, - и _, от 3 до 30 символов. Он же — адрес профиля /u/логин.">
        <input
          name="login"
          required
          minLength={3}
          maxLength={30}
          autoComplete="username"
          autoCapitalize="none"
          className={input}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />
      </Field>
      <Field label="Пароль" hint="Не короче 8 символов.">
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </Field>
      <Field label="Пароль ещё раз">
        <input name="password2" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-white hover:opacity-90 disabled:opacity-60">
        {pending ? "Создаю…" : "Зарегистрироваться"}
      </button>
    </form>
  );
}
