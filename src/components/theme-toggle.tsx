"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Светлая", Icon: Sun },
  { value: "dark", label: "Тёмная", Icon: Moon },
  { value: "system", label: "Как в системе", Icon: Monitor },
];

/** Тема меняется сразу, без перезагрузки; cookie нужна, чтобы при следующем открытии сервер отдал ту же тему. */
function applyTheme(value: Theme) {
  const root = document.documentElement;
  if (value === "system") {
    delete root.dataset.theme;
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    root.dataset.theme = value;
    document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
  }
}

export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function choose(value: Theme) {
    setTheme(value);
    setOpen(false);
    applyTheme(value);
  }

  const Current = OPTIONS.find((o) => o.value === theme)?.Icon ?? Monitor;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
        aria-label="Тема оформления"
        aria-expanded={open}
        title="Тема оформления"
      >
        <Current className="size-4.5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 text-sm shadow-lg">
          {OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => choose(value)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 ${theme === value ? "text-accent" : ""}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
