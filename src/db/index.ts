import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString && process.env.NEXT_PHASE !== "phase-production-build") {
  console.warn("DATABASE_URL не задан. Скопируйте .env.example в .env и заполните.");
}

// postgres-js подключается лениво (при первом запросе), поэтому сборка проходит и без базы.
// В dev Next перезагружает модули — держим одно подключение на процесс.
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client =
  globalForDb.pg ?? postgres(connectionString ?? "postgres://localhost:5432/roadmaps", { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export { schema };
