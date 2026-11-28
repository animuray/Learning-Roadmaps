/**
 * Настройка базы песочницы SQL-тренажёра: npm run sql:setup
 * Создаёт роль `sql_practice` и базу `sql_practice` (если их нет) и прописывает
 * SQL_PRACTICE_URL в .env. Песочница нужна, чтобы запросы ученика не видели
 * и не могли испортить данные сайта.
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const ROLE = "sql_practice";
const DB = "sql_practice";
const password = process.env.SQL_PRACTICE_PASSWORD || ROLE;
const mainUrl = process.env.DATABASE_URL;

if (!mainUrl) {
  console.error("DATABASE_URL не задан. Запускайте через npm run sql:setup (скрипт сам прочитает .env).");
  process.exit(1);
}

function deriveUrl(db) {
  const u = new URL(mainUrl);
  u.username = ROLE;
  u.password = password;
  u.pathname = `/${db}`;
  return u.toString();
}

const main = postgres(mainUrl, { max: 1 });

try {
  const [role] = await main`select 1 from pg_roles where rolname = ${ROLE}`;
  if (!role) {
    await main.unsafe(`create role ${ROLE} login password '${password.replace(/'/g, "''")}'`);
    console.log(`Создана роль ${ROLE}`);
  } else {
    console.log(`Роль ${ROLE} уже есть`);
  }

  const [db] = await main`select 1 from pg_database where datname = ${DB}`;
  if (!db) {
    await main.unsafe(`create database ${DB} owner ${ROLE}`);
    console.log(`Создана база ${DB}`);
  } else {
    console.log(`База ${DB} уже есть`);
  }
} catch (e) {
  console.error("Не удалось создать роль/базу:", e.message);
  console.error(
    `Нужны права CREATEROLE/CREATEDB у пользователя из DATABASE_URL.\n` +
      `Вариант: выполните от суперпользователя:\n` +
      `  create role ${ROLE} login password '${password}';\n` +
      `  create database ${DB} owner ${ROLE};`,
  );
  await main.end();
  process.exit(1);
}

// Права на схему public: её владелец — роль песочницы, там она создаёт таблицы задач.
const prac = postgres(deriveUrl(DB), { max: 1 });
try {
  await prac.unsafe(`alter schema public owner to ${ROLE}`);
  console.log("Схема public переведена во владение", ROLE);
} catch (e) {
  console.log("Схема public уже настроена или не требует прав:", e.message.split("\n")[0]);
}
await prac.end();
await main.end();

// Прописываем SQL_PRACTICE_URL в .env (сохраняя комментарии и кодировку).
const envPath = path.resolve(process.cwd(), ".env");
const line = `SQL_PRACTICE_URL=${deriveUrl(DB)}`;
let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
if (/^SQL_PRACTICE_URL=.*$/m.test(content)) {
  content = content.replace(/^SQL_PRACTICE_URL=.*$/m, line);
} else {
  content = `${content.trimEnd()}\n\n# Песочница SQL-тренажёра (создаётся npm run sql:setup)\n${line}\n`;
}
fs.writeFileSync(envPath, content, "utf8");
console.log(`Записано в .env: ${line}`);
console.log("Готово. Перезапустите dev-сервер, чтобы подхватился новый адрес.");
