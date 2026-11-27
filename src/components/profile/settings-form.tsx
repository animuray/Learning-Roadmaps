"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/actions/profile";
import type { FormState } from "@/app/actions/learning";

type Initial = {
  name: string;
  handle: string;
  bio: string;
  telegram: string;
  github: string;
  website: string;
  isPublic: boolean;
  email: string;
};

const input = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

export function SettingsForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, null);
  return (
    <form action={action} className="mt-6 space-y-5 rounded-2xl border border-line bg-surface p-6">
      <label className="block">
        <span className="text-sm font-medium">Имя</span>
        <input name="name" defaultValue={initial.name} required className={input} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Адрес профиля</span>
        <div className="mt-1 flex items-center rounded-lg border border-line bg-surface-2 text-sm">
          <span className="pl-3 text-muted">/u/</span>
          <input name="handle" defaultValue={initial.handle} required className="w-full bg-transparent px-1 py-2 outline-none" />
        </div>
      </label>
      <label className="block">
        <span className="text-sm font-medium">О себе</span>
        <textarea name="bio" defaultValue={initial.bio} rows={3} maxLength={500} className={input} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Telegram</span>
          <input name="telegram" defaultValue={initial.telegram} placeholder="username" className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">GitHub</span>
          <input name="github" defaultValue={initial.github} placeholder="username" className={input} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium">Сайт</span>
        <input name="website" defaultValue={initial.website} placeholder="https://" className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublic" defaultChecked={initial.isPublic} className="size-4" />
        Публичный профиль: другие люди могут видеть активность и прогресс
      </label>
      <div className="text-xs text-muted">Вход через Google: {initial.email}</div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
          {pending ? "Сохраняю…" : "Сохранить"}
        </button>
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
