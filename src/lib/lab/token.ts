import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Токен терминала: сайт подписывает, lab-runner проверяет общим секретом LAB_SECRET.
 * Браузер получает токен и передаёт его в WebSocket — подделать стенд или
 * пользователя он не может. Модуль общий для Next.js и lab-runner, без server-only.
 */
export type TerminalClaims = {
  /** id пользователя сайта — для лимита сессий. */
  sub: string;
  /** Адрес стенда, к которому открыть терминал. */
  host: string;
  port: number;
  /** Срок годности, секунды Unix. */
  exp: number;
};

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function signTerminalToken(claims: Omit<TerminalClaims, "exp">, secret: string, ttlSeconds = 60): string {
  const body = b64(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${body}.${sign(body, secret)}`;
}

export function verifyTerminalToken(token: string, secret: string): TerminalClaims | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body, secret));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TerminalClaims;
    if (typeof claims.exp !== "number" || claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}
