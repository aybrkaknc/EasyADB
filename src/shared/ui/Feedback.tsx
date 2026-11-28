import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { TaskProgress } from "../../bindings";
import { cn } from "../lib/cn";
import { type Lane, secondsLeft } from "../jobs/store";
import { clock, formatBytes, percent } from "../lib/format";
import { useToasts } from "../hooks/useToasts";
import { Button } from "./Button";

export function ProgressBar({ value }: { value: number | null }) {
  return (
    <div
      className="relative h-1.5 w-full overflow-hidden bg-neon/10"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
    >
      {value === null ? (
        <div className="absolute inset-y-0 w-1/3 animate-pulse bg-neon/60" />
      ) : (
        <div className="h-full bg-neon transition-[width]" style={{ width: `${value}%` }} />
      )}
    </div>
  );
}

const MB = 1024 * 1024;

/** Always one line, so that nothing jumps; what is not known yet shows as a dash. */
function Amount({ lane }: { lane: Lane }) {
  const { t } = useTranslation();
  const left = secondsLeft(lane);
  return (
    <p className="mt-1.5 flex justify-between gap-3 text-[11px] text-white/60 tabular-nums">
      <span>
        {formatBytes(lane.done)} / {formatBytes(lane.total)}
      </span>
      <span>
        {t("job.rate", { rate: lane.rate > 0 ? (lane.rate / MB).toFixed(1) : "-" })}
        {" - "}
        {t("job.left", { time: left === null ? "-" : clock(left) })}
      </span>
    </p>
  );
}

/** Progress line for a running task with a cancel button. */
export function TaskBar({
  progress,
  lane,
  onCancel,
}: {
  progress: TaskProgress | null;
  /** Given for transfers: the amount, speed and time left are shown below the bar. */
  lane?: Lane | null;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const total = progress?.total ?? 0;
  const value = progress && total > 0 ? percent(progress.current ?? 0, total) : null;
  return (
    <div
      className="flex items-center gap-3 border-t border-line bg-black/70 px-6 py-3"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex justify-between gap-3 text-[11px]">
          <span className="truncate text-neon">
            {progress?.stage ? t(`task.stage.${progress.stage}`) : t("common.loading")}
            {progress?.item && <span className="ml-2 text-white/60">{progress.item}</span>}
          </span>
          {value !== null && <span className="tabular-nums">{value.toFixed(0)}%</span>}
        </div>
        <ProgressBar value={value} />
        {lane && lane.total > 0 && <Amount lane={lane} />}
      </div>
      {onCancel && (
        <Button variant="danger" size="sm" onClick={onCancel}>
          {t("task.cancel")}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-neon/40">
      <Icon className="size-10" aria-hidden />
      <p className="label text-neon/60">{text}</p>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-neon" role="status">
      <span className="size-2 animate-ping bg-neon" />
      {label}
    </div>
  );
}

const BADGE: Record<string, string> = {
  neon: "border-neon/40 text-neon",
  warn: "border-warn/50 text-warn",
  danger: "border-danger/50 text-danger",
  muted: "border-white/15 text-white/60",
};

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: keyof typeof BADGE;
  children: string;
}) {
  return (
    <span className={cn("border px-1.5 py-px text-[11px] tracking-widest uppercase", BADGE[tone])}>
      {children}
    </span>
  );
}

export function Toaster() {
  const { t } = useTranslation();
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          className={cn(
            "clip-corners-sm pointer-events-auto flex items-start gap-3 border bg-black/95 px-4 py-3 text-xs",
            toast.kind === "error" && "border-danger/60 text-danger",
            toast.kind === "warning" && "border-warn/60 text-warn",
            (toast.kind === "success" || toast.kind === "info") && "border-neon/50 text-neon",
          )}
        >
          <p className="flex-1 break-words whitespace-pre-wrap">{toast.text}</p>
          {toast.action && (
            <button type="button" className="shrink-0 underline" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
          <button type="button" onClick={() => dismiss(toast.id)} aria-label={t("common.close")}>
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
