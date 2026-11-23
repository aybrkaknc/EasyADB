import { save } from "@tauri-apps/plugin-dialog";
import { Play, ScrollText, Square } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";

import { commands, type DeviceEntry, events, type LogLine } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { cn } from "../../shared/lib/cn";
import { Button } from "../../shared/ui/Button";
import { Checkbox, Input } from "../../shared/ui/Controls";
import { DeviceGuard } from "../../shared/ui/DeviceGuard";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { compileSearch, filterLines, formatLine, highlight, LEVELS } from "./filter";

const MAX_LINES = 20000;
const LEVEL_COLOR: Record<string, string> = {
  V: "text-white/40",
  D: "text-white/70",
  I: "text-neon/90",
  W: "text-warn",
  E: "text-danger",
  F: "text-danger font-bold",
};

function Logcat({ device }: { device: DeviceEntry }) {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const [levels, setLevels] = useState<Set<string>>(() => new Set(LEVELS));
  const [tags, setTags] = useState("");
  const [search, setSearch] = useState("");
  const [follow, setFollow] = useState(true);
  const stopRef = useRef<() => void>(() => {});

  const compiled = compileSearch(search);
  const regex = compiled instanceof RegExp ? compiled : null;
  const visible = useMemo(
    () => filterLines(lines, { levels, tags, search }),
    [lines, levels, tags, search],
  );

  const start = async (record: boolean) => {
    const recordPath = record
      ? await save({
          defaultPath: "logcat.log",
          filters: [{ name: "Log", extensions: ["log", "txt"] }],
        })
      : null;
    if (record && !recordPath) return;
    const id = crypto.randomUUID();
    setTaskId(id);
    setRecording(recordPath);
    const unlisten = await events.logcatBatch.listen((event) => {
      if (event.payload.taskId === id)
        setLines((prev) => [...prev, ...event.payload.lines].slice(-MAX_LINES));
    });
    stopRef.current = () => void commands.cancelTask(id);
    try {
      await commands.startLogcat(id, device.serial, recordPath);
    } catch (error) {
      feedback.failure(error);
    } finally {
      unlisten();
      setTaskId(null);
      setRecording(null);
    }
  };

  const exportView = async () => {
    const path = await save({
      defaultPath: "logcat-view.log",
      filters: [{ name: "Log", extensions: ["log", "txt"] }],
    });
    if (!path) return;
    try {
      await commands.saveTextFile(path, visible.map(formatLine).join("\n"));
    } catch (error) {
      feedback.failure(error);
    }
  };

  const toggleLevel = (level: string) =>
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        {taskId ? (
          <Button size="sm" variant="danger" onClick={() => stopRef.current()}>
            <Square className="size-3" />
            {t("logcat.stop")}
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={() => void start(false)}>
              <Play className="size-3" />
              {t("logcat.start")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void start(true)}>
              {t("logcat.record")}
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => setLines([])}>
          {t("logcat.clearView")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void commands.clearLogcat(device.serial).catch(feedback.failure)}
        >
          {t("logcat.clearDevice")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void exportView()}
          disabled={visible.length === 0}
        >
          {t("logcat.export")}
        </Button>
        <span className="label ml-auto">{t("logcat.lines", { count: visible.length })}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            aria-pressed={levels.has(level)}
            title={t(`logcat.level.${level}`)}
            onClick={() => toggleLevel(level)}
            className={cn(
              "w-7 border py-0.5 text-[11px]",
              levels.has(level)
                ? cn("border-current", LEVEL_COLOR[level])
                : "border-white/10 text-white/25",
            )}
          >
            {level}
          </button>
        ))}
        <Input
          className="max-w-48"
          placeholder={t("logcat.tag")}
          aria-label={t("logcat.tag")}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <Input
          data-search
          className={cn("max-w-72", compiled === "invalid" && "border-danger")}
          placeholder={t("logcat.search")}
          aria-label={t("logcat.search")}
          aria-invalid={compiled === "invalid"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {compiled === "invalid" && (
          <span className="text-[11px] text-danger">{t("logcat.invalidRegex")}</span>
        )}
        <Checkbox checked={follow} onChange={setFollow} label={t("logcat.autoscroll")} />
        {recording && (
          <span className="truncate text-[11px] text-warn">
            {t("logcat.recording", { path: recording })}
          </span>
        )}
      </div>
      <Virtuoso
        className="flex-1 border-t border-line bg-black/80 font-mono text-[11px]"
        data={visible}
        followOutput={follow ? "auto" : false}
        itemContent={(_, line) => (
          <div
            className={cn(
              "flex gap-3 px-6 py-px whitespace-pre select-text",
              LEVEL_COLOR[line.level],
            )}
          >
            <span className="shrink-0 text-white/30">{line.time}</span>
            <span className="w-4 shrink-0">{line.level}</span>
            <span className="w-40 shrink-0 truncate text-acid/80">{line.tag}</span>
            <span className="min-w-0 break-all whitespace-pre-wrap">
              {highlight(line.message, regex).map((part, i) =>
                part.match ? (
                  <mark key={i} className="bg-warn text-black">
                    {part.text}
                  </mark>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </span>
          </div>
        )}
      />
    </div>
  );
}

export function LogcatView() {
  const { t } = useTranslation();
  return (
    <>
      <ModuleHeader
        icon={ScrollText}
        title={t("modules.logcat.title")}
        subtitle={t("modules.logcat.subtitle")}
      />
      <DeviceGuard>{(device) => <Logcat key={device.serial} device={device} />}</DeviceGuard>
    </>
  );
}
