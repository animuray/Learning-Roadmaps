import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { ensureHandle } from "@/lib/handle";

export const devLoginEnabled = process.env.DEV_LOGIN === "true";

const providers: Provider[] = [Google];

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
