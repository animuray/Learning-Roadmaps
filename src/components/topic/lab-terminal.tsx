"use client";

import { useEffect, useRef, useState } from "react";
import { Plug, RotateCw, TerminalSquare } from "lucide-react";
import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { getLabTerminal } from "@/app/actions/lab";

type Status = "idle" | "connecting" | "open" | "closed";

/**
 * Терминал учебного стенда: xterm.js ↔ WebSocket ↔ lab-runner ↔ SSH.
 * Открывается по кнопке, чтобы не держать сессию на стенде при каждом просмотре темы.
 */
export function LabTerminal({ roadmap, topic, disabled }: { roadmap: string; topic: string; disabled?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<{ fit(): void } | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      ws.current?.close();
      term.current?.dispose();
    };
  }, []);

  async function ensureTerminal(): Promise<Terminal> {
    if (term.current) return term.current;
    const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
    const t = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      theme: { background: "#0d1117", foreground: "#e6edf3", cursor: "#e6edf3" },
      scrollback: 5000,
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(box.current!);
    f.fit();
    t.onData((d) => ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify({ t: "i", d })));
    t.onResize(({ cols, rows }) => {
      if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ t: "r", c: cols, r: rows }));
    });
    new ResizeObserver(() => f.fit()).observe(box.current!);
    term.current = t;
    fit.current = f;
    return t;
  }

  async function open() {
    setError(null);
    setStatus("connecting");
    try {
      const t = await ensureTerminal();
      const { url, token } = await getLabTerminal({ roadmap, topic });
      ws.current?.close();
      const socket = new WebSocket(`${url}?token=${encodeURIComponent(token)}&cols=${t.cols}&rows=${t.rows}`);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => {
        setStatus("open");
        t.focus();
      };
      socket.onmessage = (e) => t.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data as ArrayBuffer));
      socket.onclose = () => setStatus((s) => (s === "connecting" ? "closed" : s === "open" ? "closed" : s));
      socket.onerror = () => setError("Не удалось подключиться к lab-runner. Он запущен?");
      ws.current = socket;
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-line bg-[#0d1117]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-white/70">
        <TerminalSquare className="size-4" />
        <span className="font-mono">student@stand</span>
        <span className="ml-auto flex items-center gap-2">
          {status === "open" && <span className="text-emerald-400">● подключено</span>}
          {status === "connecting" && <span>подключение…</span>}
          {status === "closed" && <span className="text-amber-400">● отключено</span>}
          {(status === "closed" || status === "open") && (
            <button
              type="button"
              onClick={() => void open()}
              className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 hover:bg-white/10"
            >
              <RotateCw className="size-3" /> Переподключить
            </button>
          )}
        </span>
      </div>
      <div className="relative h-[380px]">
        <div ref={box} className="absolute inset-0 p-2" />
        {status === "idle" && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            {disabled ? (
              <p className="text-sm text-white/60">Войдите, чтобы открыть терминал учебного стенда.</p>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => void open()}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  <Plug className="size-4" /> Открыть терминал
                </button>
                <p className="mt-2 text-xs text-white/50">Ubuntu 24.04, пользователь student с правами sudo</p>
              </div>
            )}
          </div>
        )}
      </div>
      {error && <div className="border-t border-white/10 px-3 py-2 text-sm text-red-400">{error}</div>}
    </div>
  );
}
