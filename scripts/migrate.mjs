// Применяет SQL-миграции из папки drizzle/ к базе из DATABASE_URL.
// Запускается при старте контейнера и командой `npm run db:migrate`.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("Миграции применены");
} finally {
  await sql.end();
}
