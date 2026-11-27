import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ------------------------------------------------------------------ */
/* Auth.js tables (структура задана @auth/drizzle-adapter)             */
/* ------------------------------------------------------------------ */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // --- поля профиля ---
  handle: text("handle").unique(),
  bio: text("bio"),
  telegram: text("telegram"),
  github: text("github"),
  website: text("website"),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ------------------------------------------------------------------ */
/* Обучение                                                            */
/* ------------------------------------------------------------------ */

/** Состояние темы у пользователя. Тема адресуется парой roadmap + topic (slug из контента). */
export const topicProgress = pgTable(
  "topic_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roadmap: text("roadmap").notNull(),
    topic: text("topic").notNull(),
    /** started — открыл тему, passed — сдал тест или отметил изученной */
    status: text("status").$type<"started" | "passed">().notNull().default("started"),
    bestScore: integer("best_score").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
    passedAt: timestamp("passed_at", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roadmap, t.topic] })],
);

/** Каждая попытка теста. */
export const quizAttempts = pgTable(
  "quiz_attempt",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roadmap: text("roadmap").notNull(),
    topic: text("topic").notNull(),
    correct: integer("correct").notNull(),
    total: integer("total").notNull(),
    score: integer("score").notNull(),
    passed: boolean("passed").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("quiz_attempt_user_idx").on(t.userId, t.createdAt)],
);

/** Лента активности — из неё строится тепловая карта и серии дней. */
export const activities = pgTable(
  "activity",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type")
      .$type<"read" | "quiz" | "pass" | "practice" | "material" | "note">()
      .notNull(),
    roadmap: text("roadmap"),
    topic: text("topic"),
    /** Сколько "очков" активности даёт событие (правильные ответы, пункты практики и т.д.) */
    amount: integer("amount").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("activity_user_idx").on(t.userId, t.createdAt)],
);

/** Личные материалы: ссылки, по которым учился. */
export const userMaterials = pgTable(
  "user_material",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roadmap: text("roadmap").notNull(),
    topic: text("topic").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("user_material_topic_idx").on(t.userId, t.roadmap, t.topic)],
);

/** Личный конспект пользователя по теме. */
export const userNotes = pgTable(
  "user_note",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roadmap: text("roadmap").notNull(),
    topic: text("topic").notNull(),
    body: text("body").notNull().default(""),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roadmap, t.topic] })],
);

/** Отмеченные пункты практики (чек-лист из раздела «Практика» в теме). */
export const practiceChecks = pgTable(
  "practice_check",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roadmap: text("roadmap").notNull(),
    topic: text("topic").notNull(),
    itemKey: text("item_key").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roadmap, t.topic, t.itemKey] })],
);
