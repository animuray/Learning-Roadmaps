import "server-only";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import type { SqlTask } from "@/lib/content";

/**
 * Песочница SQL-тренажёра: отдельная база `sql_practice` и отдельная роль,
 * чтобы запросы ученика не могли увидеть или испортить данные сайта (таблицы
 * пользователей, прогресс и т.д.).
 *
 * Каждый запуск выполняется в одной транзакции:
 *   CREATE SCHEMA u_<random> → seed → запрос ученика → эталон → ROLLBACK.
 * Схема создаётся заново при каждом запуске и откатывается вместе с транзакцией,
 * поэтому параллельные ученики не мешают друг другу, а данные не накапливаются.
 *
 * Настройка локально: `npm run sql:setup`. В docker-compose роль и база
 * создаются скриптом в scripts/sql-practice-init.sql.
 */

const MAX_ROWS = 200;
const TIMEOUT_MS = 10_000;
const MAX_SQL_LENGTH = 10_000;

/** Управляющие транзакциями команды запрещены: они сломали бы откат. */
const TX_CONTROL_RE = /\b(commit|rollback|begin|start\s+transaction|savepoint|release\s+savepoint|prepare\s+transaction)\b/i;

export type SqlRunResult = {
  /** Запрос выполнился (без ошибок синтаксика и т.п.). */
  ok: boolean;
  /** Проверка пройдена (результат совпал с эталоном). */
  passed: boolean;
  /** Каким способом проверялась задача (для сообщений в интерфейсе). */
  kind: "rows" | "state" | "regex" | null;
  columns: string[];
  rows: (string | null)[][];
  error: string | null;
};

function practiceUrl(): string {
  if (process.env.SQL_PRACTICE_URL) return process.env.SQL_PRACTICE_URL;
  const main = process.env.DATABASE_URL;
  if (main) {
    try {
      const u = new URL(main);
      u.pathname = "/sql_practice";
      return u.toString();
    } catch {
      /* падаем в общий случай */
    }
  }
  return "postgres://localhost:5432/sql_practice";
}

// В dev Next перезагружает модули — держим пул одно подключение на процесс.
const globalForSql = globalThis as unknown as { pgPractice?: ReturnType<typeof postgres> };
function pool(): ReturnType<typeof postgres> {
  if (!globalForSql.pgPractice) {
    globalForSql.pgPractice = postgres(practiceUrl(), {
      max: 5,
      connect_timeout: 5,
      idle_timeout: 30,
      max_lifetime: 60 * 30,
      // Даты и время показываем как psql ('2026-04-01'), а не как JS Date в UTC.
      types: {
        datetime: {
          to: 1184,
          from: [1082, 1083, 1114, 1184, 1266],
          serialize: (x: unknown) => String(x),
          parse: (x: string) => x,
        },
      },
    });
  }
  return globalForSql.pgPractice;
}

function cell(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Строки результата в виде массивов (режим .values()): с объектами одноимённые
 * столбцы (`SELECT a.id, b.id`) затирали бы друг друга.
 */
type Rows = unknown[][] & { columns?: { name: string }[] | null; command?: string };
type Table = { columns: string[]; rows: (string | null)[][] };

function rowsOf(raw: Rows): Table {
  // Имена колонок берём из метаданных результата: так они есть и у пустой выборки.
  const columns = raw.columns?.map((c) => c.name) ?? [];
  return { columns, rows: raw.slice(0, MAX_ROWS).map((r) => r.map(cell)) };
}

/** Минимальный тип запроса и транзакции postgres.js, который нам нужен. */
type Pending = Promise<Rows | Rows[]> & {
  cursor(rows: number, cb: (rows: Rows) => unknown): Promise<unknown>;
  cancel(): void;
};
type Tx = { unsafe(query: string): { values(): Pending } };

class TimeoutError extends Error {
  constructor() {
    super(`Запрос выполнялся дольше ${TIMEOUT_MS / 1000} секунд и был остановлен. Проверьте условия соединений и циклы.`);
  }
}

/**
 * Выполняет запрос ученика с ограничениями:
 * - не больше MAX_ROWS+1 строк через курсор, иначе `SELECT generate_series(1, 1e9)`
 *   положил бы сервер в память. Многооператорные запросы курсором не работают —
 *   их выполняем как есть и показываем результат последнего оператора;
 * - сторожевой таймер отменяет запрос. На statement_timeout полагаться нельзя:
 *   ученик может выключить его своим `SET statement_timeout = 0`.
 */
async function execLimited(tx: Tx, query: string): Promise<Table> {
  const trimmed = query.trim();
  const withoutTrailing = trimmed.replace(/;+\s*$/, "");
  const multi = /;[\s\S]*\S/.test(withoutTrailing);
  const q = tx.unsafe(multi ? trimmed : withoutTrailing).values();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    q.cancel();
  }, TIMEOUT_MS);
  try {
    if (multi) {
      const res = await q;
      // Один результат — объект Result с полем command; несколько операторов —
      // обычный массив таких результатов (точка с запятой могла быть и внутри строки).
      if (typeof (res as Rows).command === "string") return rowsOf(res as Rows);
      const sets = res as Rows[];
      return rowsOf(sets[sets.length - 1]);
    }
    const out: Rows = [];
    await q.cursor(50, (rows) => {
      if (!out.columns && rows.columns) out.columns = rows.columns;
      for (const row of rows) {
        out.push(row);
        if (out.length > MAX_ROWS) return pool().CLOSE;
      }
    });
    return rowsOf(out);
  } catch (e) {
    throw timedOut ? new TimeoutError() : e;
  } finally {
    clearTimeout(timer);
  }
}

function sameRows(a: (string | null)[][], b: (string | null)[][], ordered: boolean): boolean {
  if (a.length !== b.length) return false;
  if (ordered) return a.every((r, i) => JSON.stringify(r) === JSON.stringify(b[i]));
  const sa = a.map((r) => JSON.stringify(r)).sort();
  const sb = b.map((r) => JSON.stringify(r)).sort();
  return sa.every((v, i) => v === sb[i]);
}

function prettyError(e: unknown): string {
  const err = e as { message?: string; code?: string };
  const msg = err?.message ?? String(e);
  return msg.split("\n").slice(0, 6).join("\n").slice(0, 800);
}

function validate(sql: string): string | null {
  const trimmed = sql.trim();
  if (!trimmed) return "Напишите запрос";
  if (trimmed.length > MAX_SQL_LENGTH) return `Запрос слишком длинный (максимум ${MAX_SQL_LENGTH} символов)`;
  if (sql.includes("\x00")) return "Запрос содержит недопустимые символы";
  if (TX_CONTROL_RE.test(trimmed)) {
    return "Команды управления транзакциями (BEGIN, COMMIT, ROLLBACK...) здесь запрещены — результат откатывается автоматически";
  }
  return null;
}

/** Исключение-маркер: прерывает begin() после расчёта, чтобы транзакция откатилась. */
class RollbackOnly extends Error {
  constructor() {
    super("rollback");
  }
}

/** Выполняет запрос ученика в песочнице и проверяет его по эталону. */
export async function runSqlTask(task: SqlTask, userSql: string): Promise<SqlRunResult> {
  const check = task.check;
  const fail = (error: string): SqlRunResult => ({ ok: false, passed: false, kind: check.kind, columns: [], rows: [], error });

  const invalid = validate(userSql);
  if (invalid) return fail(invalid);

  const schema = `u_${randomBytes(6).toString("hex")}`;
  let out: SqlRunResult | null = null;

  try {
    await pool().begin(async (tx) => {
      // Страховка на стороне сервера; основной таймаут — сторожевой таймер в execLimited.
      await tx.unsafe(`SET LOCAL statement_timeout = '${TIMEOUT_MS}ms'`);
      await tx.unsafe(`SET LOCAL idle_in_transaction_session_timeout = '${TIMEOUT_MS * 3}ms'`);
      await tx.unsafe(`CREATE SCHEMA ${schema}`);
      await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
      if (task.seed.trim()) await tx.unsafe(task.seed);

      const userResult = await execLimited(tx, userSql);
      // Запрос ученика мог сменить search_path — эталон должен смотреть в схему задачи.
      await tx.unsafe(`SET LOCAL search_path TO ${schema}`);

      if (check.kind === "regex") {
        const text = userResult.rows.map((r) => r.map((c) => c ?? "NULL").join(" | ")).join("\n");
        out = { ok: true, passed: new RegExp(check.pattern, "i").test(text), kind: check.kind, ...userResult, error: null };
      } else if (check.kind === "state") {
        // Задача на изменение данных: запрос ученика строк не возвращает,
        // поэтому проверяем состояние базы контрольным запросом.
        const probe = await execLimited(tx, check.sql);
        const showProbe = !userResult.rows.length;
        out = {
          ok: true,
          passed: probe.rows.length > 0,
          kind: check.kind,
          columns: showProbe ? probe.columns : userResult.columns,
          rows: showProbe ? probe.rows : userResult.rows,
          error: null,
        };
      } else {
        const expected = await execLimited(tx, check.sql);
        out = {
          ok: true,
          passed: sameRows(userResult.rows, expected.rows, check.ordered),
          kind: check.kind,
          ...userResult,
          error: null,
        };
      }
      // begin() коммитит при успешном возврате — прерываем с откатом,
      // чтобы схема с данными задачи не осталась в базе.
      throw new RollbackOnly();
    });
  } catch (e) {
    if (e instanceof RollbackOnly) return out ?? fail("Внутренняя ошибка тренажёра");
    if (e instanceof TimeoutError) return fail(e.message);
    return fail(prettyError(e));
  }
  return fail("Внутренняя ошибка тренажёра");
}
