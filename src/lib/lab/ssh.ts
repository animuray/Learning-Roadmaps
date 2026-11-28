import fs from "node:fs";
import path from "node:path";
import { Client } from "ssh2";

/**
 * Подключение к учебным стендам по SSH. Общий модуль для Next.js и lab-runner.
 * Сайт выполняет на стенде подготовку и проверки (root), lab-runner открывает
 * терминал ученика (student). Ключ — LAB_SSH_KEY (по умолчанию .lab/id_ed25519,
 * создаётся `npm run lab:key`).
 */

export type Stand = { host: string; port: number };

let cachedKey: Buffer | null = null;
export function labKey(): Buffer {
  if (!cachedKey) {
    const file = path.resolve(process.cwd(), process.env.LAB_SSH_KEY || ".lab/id_ed25519");
    cachedKey = fs.readFileSync(file);
  }
  return cachedKey;
}

export function connect(stand: Stand, username: "root" | "student"): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => resolve(conn))
      .on("error", (e) => reject(new Error(`Стенд недоступен (${stand.host}:${stand.port}): ${e.message}`)))
      .connect({
        host: stand.host,
        port: stand.port,
        username,
        privateKey: labKey(),
        readyTimeout: 8000,
        keepaliveInterval: 15000,
      });
  });
}

export type ExecResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

const MAX_OUTPUT = 64 * 1024;

/**
 * Выполняет bash-скрипт на стенде: текст уходит в stdin и сохраняется во временный
 * файл, поэтому кавычки и переносы строк в скрипте не нужно экранировать. Сам скрипт
 * выполняется с пустым stdin: команды, которые читают stdin (rabbitmqctl, docker
 * compose exec, ssh), иначе «съели» бы остаток скрипта.
 */
export async function execScript(
  stand: Stand,
  username: "root" | "student",
  script: string,
  timeoutMs = 30_000,
): Promise<ExecResult> {
  const conn = await connect(stand, username);
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      conn.end();
    }, timeoutMs);
    let done = false;
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      conn.end();
      resolve({ code, stdout: stdout.slice(0, MAX_OUTPUT), stderr: stderr.slice(0, MAX_OUTPUT), timedOut });
    };
    // login-оболочка: те же PATH и окружение, что у ученика в терминале.
    conn.exec(`bash -l -c 'f=$(mktemp) && cat > "$f" && bash -l "$f" < /dev/null; r=$?; rm -f "$f"; exit $r'`, (err, stream) => {
      if (err) {
        stderr = err.message;
        return finish(null);
      }
      stream
        .on("data", (d: Buffer) => {
          if (stdout.length < MAX_OUTPUT) stdout += d.toString("utf8");
        })
        .on("close", (code: number | null) => finish(code));
      stream.stderr.on("data", (d: Buffer) => {
        if (stderr.length < MAX_OUTPUT) stderr += d.toString("utf8");
      });
      stream.end(script.endsWith("\n") ? script : script + "\n");
    });
    conn.on("close", () => finish(null));
  });
}
