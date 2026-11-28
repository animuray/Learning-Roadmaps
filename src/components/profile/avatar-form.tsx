"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { removeAvatar, uploadAvatar } from "@/app/actions/profile";
import { Avatar } from "@/components/avatar";

const SIZE = 256;

/** Квадрат из центра картинки, уменьшенный до SIZE×SIZE: на сервер уходит 10–40 КБ вместо фото на несколько мегабайт. */
async function squareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  // Браузер без кодировщика WebP вернёт PNG — тогда берём JPEG, он меньше.
  const webp = await toBlob("image/webp");
  const blob = webp?.type === "image/webp" ? webp : await toBlob("image/jpeg");
  if (!blob) throw new Error("toBlob");
  return blob;
}

export function AvatarForm({ name, image }: { name: string; image: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      let blob: Blob;
      try {
        blob = await squareImage(file);
      } catch {
        setError("Не удалось открыть картинку. Подойдёт JPEG, PNG или WebP.");
        return;
      }
      const fd = new FormData();
      fd.set("avatar", new File([blob], "avatar", { type: blob.type }));
      const res = await uploadAvatar(null, fd);
      if (res?.error) setError(res.error);
    });
    if (input.current) input.current.value = "";
  }

  return (
    <div className="mt-6 flex items-center gap-5 rounded-2xl border border-line bg-surface p-6">
      <div className={pending ? "opacity-50" : ""}>
        <Avatar name={name} image={image} size={88} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">Аватарка</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            <ImageUp className="size-4" /> {pending ? "Загружаю…" : "Загрузить фото"}
          </button>
          {image && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => removeAvatar())}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-60"
            >
              <Trash2 className="size-4" /> Убрать
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">Картинка обрежется до квадрата по центру.</p>
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}
