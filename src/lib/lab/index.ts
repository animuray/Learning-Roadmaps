import "server-only";
import type { Lab, LabTask } from "@/lib/content";
import { matchNotes } from "@/lib/content/task-blocks";
import type { CurrentUser } from "@/lib/session";
import { execScript, type Stand } from "./ssh";
import { signTerminalToken } from "./token";

/**
 * Лаборатории: терминал на учебном стенде и проверка задач скриптами.
 *
 * Сейчас один драйвер — «статический стенд»: все ученики работают на машине
 * LAB_SSH_HOST:LAB_SSH_PORT (для разработки — WSL-стенд `npm run lab:stand:wsl`,
 * на сервере — постоянный контейнер). Отдельный стенд на каждого ученика через
 * Proxmox API — следующий шаг (docs/practice-lab.md).
 */

export type LabConfig = { stand: Stand; secret: string; wsUrl: string };

/** Настройки лаборатории или null, если на этом сервере она не настроена. */
export function labConfig(): LabConfig | null {
  const secret = process.env.LAB_SECRET;
  if (!secret || !process.env.LAB_SSH_HOST) return null;
  return {
    stand: { host: process.env.LAB_SSH_HOST, port: Number(process.env.LAB_SSH_PORT || 22) },
    secret,
    wsUrl: process.env.LAB_WS_URL || "ws://localhost:3001/lab/ws",
  };
}

/**
 * Кому можно открывать терминал: стенды — ресурсы домашнего сервера, а зарегистрироваться
 * может кто угодно. Пускаем по спискам LAB_ALLOWED_EMAILS (вход через Google) и
 * LAB_ALLOWED_USERS (логины; «*» — все вошедшие). При DEV_LOGIN (локальная разработка) — всем.
 */
export function canUseLab(user: CurrentUser): boolean {
  if (process.env.DEV_LOGIN === "true") return true;
  const list = (v: string | undefined) =>
    (v || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  const users = list(process.env.LAB_ALLOWED_USERS);
  if (users.includes("*") || (!!user.handle && users.includes(user.handle.toLowerCase()))) return true;
  return !!user.email && list(process.env.LAB_ALLOWED_EMAILS).includes(user.email.toLowerCase());
}

/** Стенд пользователя. Пока у всех один и тот же. */
export function standFor(config: LabConfig, user: Pick<CurrentUser, "id">): Stand {
  void user;
  return config.stand;
}

export function terminalToken(config: LabConfig, user: Pick<CurrentUser, "id">): string {
  const stand = standFor(config, user);
  return signTerminalToken({ sub: user.id, host: stand.host, port: stand.port }, config.secret);
}

const HISTORY = "/home/student/.bash_history";
const OFFSET = "/var/lib/lab/history-offset";

/**
 * Общее начало скриптов подготовки и проверки (выполняются от root):
 * git должен работать с репозиториями ученика, хотя их владелец — student.
 */
const PRELUDE = `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'`;

/** Функции, доступные в скриптах проверки. */
const CHECK_PRELUDE = `${PRELUDE}
fail() { echo "✗ $*"; exit 1; }
ok() { echo "✓ $*"; }
`;

export type LabStepResult = { ok: boolean; output: string };

/**
 * Подготовка стенда к задаче: общий setup лаборатории + setup задачи (от root).
 * Запоминает, сколько строк в истории команд, — замечания при проверке
 * смотрят только на команды, введённые после начала задачи.
 */
export async function startTask(stand: Stand, lab: Lab, task: LabTask): Promise<LabStepResult> {
  // Подготовка — в подоболочке: её код возврата и есть результат; служебные
  // команды после неё не должны его затирать.
  const script = [
    PRELUDE,
    lab.lib,
    "(",
    lab.setup,
    task.setup,
    ")",
    "rc=$?",
    `touch ${HISTORY} && chown student:student ${HISTORY}`,
    `wc -l < ${HISTORY} > ${OFFSET}`,
    "exit $rc",
  ]
    .filter(Boolean)
    .join("\n");
  const r = await execScript(stand, "root", script, 180_000);
  if (r.timedOut) return { ok: false, output: "Подготовка стенда не уложилась в 3 минуты" };
  return { ok: r.code === 0, output: (r.stdout + r.stderr).trim() };
}

export type LabCheckResult = {
  passed: boolean;
  /** Что вывел скрипт проверки: «✗ пользователь не в группе sudo» и т.п. */
  output: string;
  /** Замечания по командам ученика (правила из ```text notes). */
  notes: string[];
};

/**
 * Проверка задачи: скрипт от root, код 0 — решено. Замечания по истории команд — только после
 * решения: до него они выдавали бы способ решения.
 */
export async function checkTask(stand: Stand, lab: Lab, task: LabTask): Promise<LabCheckResult> {
  const r = await execScript(stand, "root", [CHECK_PRELUDE, lab.lib, task.check].filter(Boolean).join("\n"), 60_000);
  if (r.timedOut) return { passed: false, output: "Проверка не уложилась в минуту", notes: [] };
  let notes: string[] = [];
  if (r.code === 0 && task.notes.length) {
    const h = await execScript(
      stand,
      "root",
      `off=$(cat ${OFFSET} 2>/dev/null || echo 0); tail -n +$((off + 1)) ${HISTORY} 2>/dev/null`,
      10_000,
    );
    notes = matchNotes(task.notes, h.stdout);
  }
  const output = (r.stdout + (r.code === 0 ? "" : r.stderr)).trim();
  return { passed: r.code === 0, output, notes };
}
