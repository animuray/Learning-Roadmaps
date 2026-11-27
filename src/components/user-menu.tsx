"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Avatar } from "./avatar";

export function UserMenu({ name, image, profileHref }: { name: string; image: string | null; profileHref: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-surface-2"
        aria-expanded={open}
      >
        <Avatar name={name} image={image} size={30} />
        <span className="hidden max-w-40 truncate text-sm sm:inline">{name}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 text-sm shadow-lg">
          <Link href={profileHref} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2" onClick={() => setOpen(false)}>
            <User className="size-4" /> Мой профиль
          </Link>
          <Link href="/settings" className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2" onClick={() => setOpen(false)}>
            <Settings className="size-4" /> Настройки
          </Link>
          <form action={signOutAction}>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
              <LogOut className="size-4" /> Выйти
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
