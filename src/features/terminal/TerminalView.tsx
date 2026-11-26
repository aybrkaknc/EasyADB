import { useQuery } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { Play, Square, SquareTerminal } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";

import { commands, events, type StreamKind } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { cn } from "../../shared/lib/cn";
import { useHold } from "../../shared/jobs/store";
import { Button } from "../../shared/ui/Button";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { complete } from "./completion";

interface Line {
  id: number;
  kind: StreamKind | "input";
  text: string;
}

const MAX_LINES = 5000;

export function TerminalView() {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const { selected } = useDevices();
  const serial = selected?.serial ?? null;
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [taskId, setTaskId] = useState<string | null>(null);
  useHold(taskId !== null);
  const nextId = useRef(0);
  const packages = useQuery({
    queryKey: ["apps", serial],
    queryFn: () => commands.listDeviceApps(serial!),
    enabled: selected?.state === "device",
    select: (apps) => apps.map((a) => a.package),
  });

  const append = (kind: Line["kind"], text: string) =>
    setLines((prev) => [...prev, { id: nextId.current++, kind, text }].slice(-MAX_LINES));

  const run = async () => {
    const line = input.trim();
    if (!line || taskId) return;
    setInput("");
    setCursor(-1);
    setHistory((h) => [line, ...h.filter((x) => x !== line)].slice(0, 100));
    append("input", `${serial ?? "-"} $ ${line}`);
    const id = crypto.randomUUID();
    setTaskId(id);
    const unlisten = await events.commandOutput.listen((event) => {
      const p = event.payload;
      if (p.taskId !== id) return;
      if (p.kind === "exit") append("exit", t("terminal.exit", { code: p.exitCode ?? "-" }));
      else append(p.kind, p.text);
    });
    try {
      await commands.runTerminal(id, serial, line);
    } catch (error) {
      feedback.failure(error);
    } finally {
      unlisten();
      setTaskId(null);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      void run();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.max(
        -1,
        Math.min(history.length - 1, cursor + (event.key === "ArrowUp" ? 1 : -1)),
      );
      setCursor(next);
      setInput(next === -1 ? "" : (history[next] ?? ""));
    } else if (event.key === "Tab") {
      event.preventDefault();
      const completed = complete(input, packages.data ?? []);
      if (completed) setInput(completed);
    }
  };

  const exportLog = async () => {
    const path = await save({
      defaultPath: "terminal.txt",
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (!path) return;
    try {
      await commands.saveTextFile(path, lines.map((l) => l.text).join("\n"));
    } catch (error) {
      feedback.failure(error);
    }
  };

  return (
    <>
      <ModuleHeader
        icon={SquareTerminal}
        title={t("modules.terminal.title")}
        subtitle={t("modules.terminal.subtitle")}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setLines([])}>
              {t("common.clear")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void exportLog()}
              disabled={lines.length === 0}
            >
              {t("terminal.export")}
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col bg-black/80 font-mono text-xs">
        <Virtuoso
          className="flex-1"
          data={lines}
          followOutput="auto"
          computeItemKey={(_, line) => line.id}
          itemContent={(_, line) => (
            <pre
              className={cn(
                "px-6 py-px break-all whitespace-pre-wrap select-text",
                line.kind === "input" && "pt-2 text-acid",
                line.kind === "stderr" && "text-danger",
                line.kind === "exit" && "pb-2 text-white/40",
                line.kind === "stdout" && "text-neon/90",
              )}
            >
              {line.text}
            </pre>
          )}
        />
        {!serial && <p className="px-6 py-1 text-[11px] text-warn/80">{t("terminal.noDevice")}</p>}
        <div className="flex items-center gap-2 border-t border-line px-6 py-3">
          <span className="text-acid">$</span>
          <input
            data-search
            className="flex-1 bg-transparent text-neon outline-none placeholder:text-white/25"
            placeholder={t("terminal.placeholder")}
            aria-label={t("terminal.placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          <span className="label hidden lg:inline">{t("terminal.hint")}</span>
          {taskId ? (
            <Button size="sm" variant="danger" onClick={() => void commands.cancelTask(taskId)}>
              <Square className="size-3" />
              {t("terminal.stop")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void run()} disabled={!input.trim()}>
              <Play className="size-3" />
              {t("terminal.run")}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
