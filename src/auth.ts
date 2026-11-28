import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { ensureHandle } from "@/lib/handle";
import { verifyPassword } from "@/lib/password";

export const devLoginEnabled = process.env.DEV_LOGIN === "true";

/* Защита от подбора пароля: не больше MAX_FAILS неудачных попыток на логин за окно. Память процесса —
   для одного сервера этого достаточно; после перезапуска счётчики обнуляются. */
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const fails = new Map<string, { count: number; since: number }>();

function tooManyFails(login: string): boolean {
  const f = fails.get(login);
  if (!f) return false;
  if (Date.now() - f.since > FAIL_WINDOW_MS) {
    fails.delete(login);
    return false;
  }
  return f.count >= MAX_FAILS;
}

function noteFail(login: string) {
  const f = fails.get(login);
  if (!f || Date.now() - f.since > FAIL_WINDOW_MS) fails.set(login, { count: 1, since: Date.now() });
  else f.count++;
}

/** Хеш случайного пароля: проверка по нему всегда ложна, но занимает столько же времени, сколько настоящая. */
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const providers: Provider[] = [
  Google,
  // Вход по логину (handle) и паролю. Учётная запись создаётся на /register.
  Credentials({
    id: "password",
    name: "Логин и пароль",
    credentials: { login: { label: "Логин" }, password: { label: "Пароль", type: "password" } },
    async authorize(credentials) {
      const login = String(credentials?.login ?? "").trim().toLowerCase();
      const password = String(credentials?.password ?? "");
      if (!login || !password || tooManyFails(login)) return null;
      const [user] = await db.select().from(users).where(eq(users.handle, login));
      // Для несуществующего логина тоже считаем хеш — чтобы по времени ответа нельзя было узнать, есть ли такой пользователь.
      const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user?.passwordHash || !ok) {
        noteFail(login);
        return null;
      }
      fails.delete(login);
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

if (devLoginEnabled) {
  // Вход без Google — только для локальной разработки (DEV_LOGIN=true).
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        if (!email || !email.includes("@")) return null;
        let [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user) {
          [user] = await db
            .insert(users)
            .values({ email, name: email.split("@")[0] })
            .returning();
        }
        await ensureHandle(user.id);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) await ensureHandle(user.id);
    },
  },
});
