const SIZE = 256;

/** Квадрат из центра картинки, уменьшенный до SIZE×SIZE: на сервер уходит 10–40 КБ вместо фото на несколько мегабайт. */
export async function squareImage(file: File): Promise<Blob> {
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
