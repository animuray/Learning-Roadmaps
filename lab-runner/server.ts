/**
 * lab-runner — терминал учебного стенда в браузере: npm run lab:runner
 *
 * Браузер (xterm.js) ── WebSocket /lab/ws?token=… ──> lab-runner ── SSH (student, pty) ──> стенд
 *
 * Токен подписывает сайт (src/lib/lab/token.ts) общим секретом LAB_SECRET: в нём
 * пользователь и адрес стенда. Runner сам ничего не решает о доступе — только
 * проверяет подпись, держит лимиты и закрывает простаивающие сессии.
 *
 * Протокол: от браузера — JSON {"t":"i","d":"ввод"} и {"t":"r","c":80,"r":24} (размер),
 * к браузеру — вывод терминала двоичными кадрами.
 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import type { ClientChannel } from "ssh2";
import { WebSocketServer, type WebSocket } from "ws";
import { connect } from "../src/lib/lab/ssh";
import { verifyTerminalToken } from "../src/lib/lab/token";

const PORT = Number(process.env.LAB_RUNNER_PORT || 3001);
const SECRET = process.env.LAB_SECRET;
const IDLE_MS = 30 * 60_000;
const MAX_SESSIONS_PER_USER = 3;

if (!SECRET) {
  console.error("LAB_SECRET не задан — runner не сможет проверять токены. Задайте его в .env.");
  process.exit(1);
}

const sessions = new Map<string, number>();

function closeWith(ws: WebSocket, message: string) {
  if (ws.readyState === ws.OPEN) ws.send(Buffer.from(`\r\n\x1b[31m${message}\x1b[0m\r\n`));
  ws.close();
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: "/lab/ws", maxPayload: 64 * 1024 });

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const claims = verifyTerminalToken(url.searchParams.get("token") ?? "", SECRET);
  if (!claims) return closeWith(ws, "Токен терминала недействителен или устарел. Обновите страницу.");

  const count = sessions.get(claims.sub) ?? 0;
  if (count >= MAX_SESSIONS_PER_USER) {
    return closeWith(ws, `Открыто слишком много терминалов (больше ${MAX_SESSIONS_PER_USER}). Закройте лишние вкладки.`);
  }
  sessions.set(claims.sub, count + 1);

  const cols = Math.min(Math.max(Number(url.searchParams.get("cols")) || 80, 20), 400);
  const rows = Math.min(Math.max(Number(url.searchParams.get("rows")) || 24, 5), 200);

  let shell: ClientChannel | null = null;
  let idle: NodeJS.Timeout;
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(() => closeWith(ws, "Терминал закрыт: 30 минут без ввода."), IDLE_MS);
  };
  touch();

  let conn: Awaited<ReturnType<typeof connect>> | null = null;
  ws.on("close", () => {
    clearTimeout(idle);
    sessions.set(claims.sub, Math.max((sessions.get(claims.sub) ?? 1) - 1, 0));
    conn?.end();
  });

  try {
    conn = await connect({ host: claims.host, port: claims.port }, "student");
  } catch (e) {
    return closeWith(ws, e instanceof Error ? e.message : String(e));
  }
  if (ws.readyState !== ws.OPEN) return conn.end();

  conn.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
    if (err) return closeWith(ws, `Не удалось открыть оболочку: ${err.message}`);
    shell = stream;
    stream.on("data", (d: Buffer) => ws.readyState === ws.OPEN && ws.send(d));
    stream.stderr.on("data", (d: Buffer) => ws.readyState === ws.OPEN && ws.send(d));
    stream.on("close", () => closeWith(ws, "Сессия завершена. Нажмите «Переподключить», чтобы открыть новую."));
  });

  ws.on("message", (raw) => {
    let msg: { t?: string; d?: string; c?: number; r?: number };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t === "i" && typeof msg.d === "string") {
      touch();
      shell?.write(msg.d);
    } else if (msg.t === "r" && msg.c && msg.r) {
      shell?.setWindow(Math.min(msg.r, 200), Math.min(msg.c, 400), 0, 0);
    }
  });
});

// Проверка живых соединений: браузер мог исчезнуть без закрытия сокета.
const alive = new WeakSet<WebSocket>();
wss.on("connection", (ws) => {
  alive.add(ws);
  ws.on("pong", () => alive.add(ws));
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) ws.terminate();
    else {
      alive.delete(ws);
      ws.ping();
    }
  }
}, 30_000).unref();

// Разработка: WSL-стенд выключается, когда в нём ничего не запущено, — держим его.
let keeper: ChildProcess | null = null;
if (process.env.LAB_WSL_DISTRO) {
  keeper = spawn("wsl.exe", ["-d", process.env.LAB_WSL_DISTRO, "-u", "root", "--exec", "sleep", "infinity"], {
    stdio: "ignore",
    windowsHide: true,
  });
  keeper.on("exit", (code) => console.warn(`WSL-стенд ${process.env.LAB_WSL_DISTRO} остановлен (код ${code})`));
  const stop = () => {
    keeper?.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

server.listen(PORT, () => {
  console.log(`lab-runner: ws://localhost:${PORT}/lab/ws${keeper ? `, WSL-стенд ${process.env.LAB_WSL_DISTRO}` : ""}`);
});
