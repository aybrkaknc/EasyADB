import { useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, CircleDashed, Loader, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type Decision, events } from "../../bindings";
import { useFeedback } from "../hooks/useFeedback";
import { cn } from "../lib/cn";
import { appName, formatBytes, percent } from "../lib/format";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ProgressBar } from "../ui/Feedback";
import {
  accept,
  type Ask,
  dismissResult,
  type Job,
  type JobItem,
  type Lane,
  onAsk,
  onBatchEnd,
  onPhoneJob,
  onProgress,
  removeAsk,
  type Result,
  secondsLeft,
  STEPS,
  useJobs,
} from "./store";

/** A result without a problem closes by itself after this long. */
const CLOSE_MS = 10_000;
const MB = 1_000_000;
const SHOWN_ITEMS = 5;
/** What a finished job may have changed. */
const QUERIES = ["backups", "fileSets", "systemBackups", "phoneBackups", "phoneSystem"];

/** The current time, renewed every half second while `on`. */
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const STATE_ICON = {
  waiting: CircleDashed,
  running: Loader,
  done: Check,
  warning: CircleAlert,
  failed: X,
  cancelled: X,
} as const;

const STATE_TONE: Record<JobItem["state"], string> = {
  waiting: "text-white/40",
  running: "text-neon",
  done: "text-neon/70",
  warning: "text-warn",
  failed: "text-danger",
  cancelled: "text-white/50",
};

function Line({ state, text, note }: { state: JobItem["state"]; text: string; note?: string }) {
  const { t } = useTranslation();
  const Icon = STATE_ICON[state];
  return (
    <li className="flex flex-col gap-0.5">
      <span className={cn("flex items-center gap-2", STATE_TONE[state])}>
        <Icon
          className={cn("size-3.5 shrink-0", state === "running" && "animate-spin")}
          aria-label={t(`job.state.${state}`)}
        />
        <span className="min-w-0 flex-1 truncate">{text}</span>
      </span>
      {note && (
        <span className="pl-5.5 text-[11px] break-words whitespace-pre-wrap text-white/60">
          {note}
        </span>
      )}
    </li>
  );
}

function AskDialog({ ask }: { ask: Ask }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const feedback = useFeedback();
  const now = useNow(true);
  const speed = ask.kind === "speed";
  const model = ask.model || ask.phone;
  const left = Math.max(0, (ask.deadline - now) / 1000);

  const answer = (decision: Decision) => {
    removeAsk(ask.phone, ask.batch);
    if (decision !== "reject") accept(ask);
    void commands
      .answerPhoneRequest(ask.phone, ask.batch, decision)
      .then((open) => {
        if (!open && decision !== "reject") feedback.warning(t("ask.late"));
        void client.invalidateQueries({ queryKey: ["trustedPhones"] });
      })
      .catch(feedback.failure);
  };
  const options = [
    ask.kind === "app" && "apk",
    ask.obb && "obb",
    ask.data && "data",
    ask.externalData && "external",
  ].filter((o): o is string => typeof o === "string");
  const names = ask.kind === "app" ? ask.names.map((n) => appName({ package: n })) : ask.names;

  return (
    <Dialog
      open
      locked
      onOpenChange={() => undefined}
      title={t(speed ? "ask.speedTitle" : "ask.title", { model })}
      footer={
        <>
          <Button variant="ghost" onClick={() => answer("reject")}>
            {t("ask.reject")}
          </Button>
          <Button variant={speed ? "primary" : "ghost"} onClick={() => answer("once")}>
            {t(speed ? "ask.startSpeed" : "ask.once")}
          </Button>
          {!speed && <Button onClick={() => answer("trust")}>{t("ask.trust")}</Button>}
        </>
      }
    >
      <p className="text-sm">{t(`ask.body.${ask.kind}`, { count: ask.count })}</p>
      {names.length > 0 && (
        <ul className="flex flex-col gap-1 text-white/70">
          {names.map((name) => (
            <li key={name} className="truncate">
              {name}
            </li>
          ))}
          {!speed && ask.count > names.length && (
            <li>{t("job.more", { count: ask.count - names.length })}</li>
          )}
        </ul>
      )}
      {options.length > 0 && (
        <p className="text-white/70">
          {t("ask.includes", { list: options.map((o) => t(`ask.option.${o}`)).join(", ") })}
        </p>
      )}
      {!speed && <p className="text-white/60">{t("ask.trustHint")}</p>}
      <p className="text-warn/90 tabular-nums" role="timer">
        {t("ask.left", { time: clock(left) })}
      </p>
    </Dialog>
  );
}

function LaneInfo({ lane }: { lane: Lane }) {
  const { t } = useTranslation();
  const left = secondsLeft(lane);
  return (
    <>
      <ProgressBar value={lane.total > 0 ? percent(lane.done, lane.total) : null} />
      <p className="flex justify-between gap-3 text-[11px] text-white/60 tabular-nums">
        <span>
          {t("job.amount", {
            percent: Math.floor(percent(lane.done, lane.total)),
            done: formatBytes(lane.done),
            total: formatBytes(lane.total),
          })}
        </span>
        <span>
          {lane.rate > 0 && t("job.rate", { rate: (lane.rate / MB).toFixed(1) })}
          {left !== null && ` - ${t("job.left", { time: clock(left) })}`}
        </span>
      </p>
    </>
  );
}

function SpeedLanes({ job }: { job: Job }) {
  const { t } = useTranslation();
  return (
    <>
      {(["to_pc", "to_phone"] as const).map((key) => {
        const lane = job.speed[key];
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <span className="text-sm">{t(`speed.${key}`)}</span>
            {lane ? (
              <LaneInfo lane={lane} />
            ) : (
              <p className="text-white/50">{t("speed.waiting")}</p>
            )}
          </div>
        );
      })}
    </>
  );
}

function Steps({ job }: { job: Job }) {
  const { t } = useTranslation();
  const known = STEPS[job.kind];
  const extra = job.stage && job.stage !== "prepare" && !known.includes(job.stage);
  const steps = extra ? [...known, job.stage] : known;
  const at = steps.indexOf(job.stage);
  return (
    <ul className="flex flex-col gap-1">
      {steps.map((step, index) => (
        <Line
          key={step}
          state={index < at ? "done" : index === at ? "running" : "waiting"}
          text={t(`task.stage.${step}`)}
        />
      ))}
    </ul>
  );
}

function JobBlock({ job, now }: { job: Job; now: number }) {
  const { t } = useTranslation();
  const position = Math.min(
    job.size,
    Math.max(1, job.items.filter((i) => i.state !== "waiting").length),
  );
  const active = job.items.find((i) => i.state === "running");
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-white/80">{job.device}</p>
      {job.kind === "speed" ? (
        <SpeedLanes job={job} />
      ) : (
        <>
          {job.size > 0 && (
            <p className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{active?.name ?? job.item}</span>
              {job.size > 1 && (
                <span className="shrink-0 tabular-nums">
                  {t("job.position", { index: position, size: job.size })}
                </span>
              )}
            </p>
          )}
          <Steps job={job} />
          {job.lane ? <LaneInfo lane={job.lane} /> : <ProgressBar value={null} />}
        </>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-white/50 tabular-nums">
          {t("job.elapsed", { time: clock((now - job.startedAt) / 1000) })}
        </span>
        <Button
          variant="danger"
          size="sm"
          disabled={job.cancelling}
          onClick={() => {
            useJobs.setState((s) => ({
              jobs: s.jobs.map((j) => (j.id === job.id ? { ...j, cancelling: true } : j)),
            }));
            job.cancel();
          }}
        >
          {t(job.cancelling ? "job.cancelling" : "task.cancel")}
        </Button>
      </div>
    </section>
  );
}

function ProgressDialog({ jobs }: { jobs: Job[] }) {
  const { t } = useTranslation();
  const now = useNow(true);
  const first = jobs[0];
  return (
    <Dialog
      open
      locked
      onOpenChange={() => undefined}
      title={jobs.length === 1 && first ? t(`job.title.${first.kind}`) : t("job.running")}
    >
      {jobs.map((job) => (
        <JobBlock key={job.id} job={job} now={now} />
      ))}
    </Dialog>
  );
}

const OUTCOME_TONE: Record<Result["outcome"], string> = {
  done: "text-neon",
  warning: "text-warn",
  incomplete: "text-danger",
  cancelled: "text-white/80",
  rejected: "text-warn",
};

function ResultDialog({ result }: { result: Result }) {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const closes = result.outcome === "done" && !result.speed;
  useEffect(() => {
    if (!closes) return;
    const timer = setTimeout(() => dismissResult(result.id), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [closes, result.id]);
  const close = () => dismissResult(result.id);
  const kept = result.items.filter((i) => i.state === "done" || i.state === "warning").length;
  // Problems come first, so that a long list does not hide them.
  const order = ["failed", "warning", "cancelled", "running", "waiting", "done"];
  const items = [...result.items].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));

  return (
    <Dialog
      open
      locked
      onOpenChange={() => undefined}
      title={result.kind ? t(`job.title.${result.kind}`) : t("job.request")}
      footer={
        <>
          {result.folder && (
            <Button
              variant="ghost"
              onClick={() =>
                void commands
                  .getBackupRoot()
                  .then((path) => commands.revealPath(path))
                  .catch(feedback.failure)
              }
            >
              {t("common.openFolder")}
            </Button>
          )}
          {result.retry && (
            <Button
              variant="ghost"
              onClick={() => {
                close();
                result.retry?.();
              }}
            >
              {t("job.retry")}
            </Button>
          )}
          <Button onClick={close} autoFocus>
            {t("job.ok")}
          </Button>
        </>
      }
    >
      <p className={cn("text-sm", OUTCOME_TONE[result.outcome])} role="status">
        {t(`job.outcome.${result.outcome}`)}
      </p>
      <p className="text-white/60">{result.device}</p>
      {result.reason && <p className="break-words whitespace-pre-wrap">{result.reason}</p>}
      {result.speed &&
        (["toPc", "toPhone"] as const).map((key) => {
          const mb = result.speed?.[key] ?? null;
          return (
            <div key={key} className="flex items-baseline justify-between gap-3">
              <span className="text-sm">{t(`speed.${key === "toPc" ? "to_pc" : "to_phone"}`)}</span>
              <span className="font-mono text-lg text-neon">
                {mb === null
                  ? "-"
                  : t("speed.value", { mb: mb.toFixed(1), mbit: (mb * 8).toFixed(0) })}
              </span>
            </div>
          );
        })}
      {!result.speed && items.length > 0 && (
        <ul className="flex max-h-60 flex-col gap-1.5 overflow-auto">
          {items.map((item) => (
            <Line key={item.key} state={item.state} text={item.name} note={item.note} />
          ))}
        </ul>
      )}
      {(result.outcome === "cancelled" || result.outcome === "incomplete") && result.folder && (
        <p className="text-white/60">{t("job.kept", { count: kept })}</p>
      )}
      {result.seconds > 0 && !result.speed && (
        <p className="text-[11px] text-white/50 tabular-nums">
          {t("job.took", { time: clock(result.seconds) })}
          {result.bytes > 0 && ` - ${formatBytes(result.bytes)}`}
        </p>
      )}
    </Dialog>
  );
}

function QuitDialog() {
  const { t } = useTranslation();
  const jobs = useJobs((s) => s.jobs);
  const stay = () => useJobs.setState({ quitting: false });
  return (
    <Dialog
      open
      locked
      onOpenChange={() => undefined}
      title={t("quit.title")}
      footer={
        <>
          <Button variant="ghost" onClick={stay} autoFocus>
            {t("quit.stay")}
          </Button>
          <Button variant="danger" onClick={() => void commands.quitApp()}>
            {t("quit.leave")}
          </Button>
        </>
      }
    >
      <p className="text-sm">{t("quit.body")}</p>
      <ul className="flex flex-col gap-1 text-white/70">
        {jobs.slice(0, SHOWN_ITEMS).map((j) => (
          <li key={j.id}>
            {t(`job.title.${j.kind}`)} - {j.device}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Connects the store to the backend. Also asks what went on before this window was ready. */
function useJobEvents() {
  useEffect(() => {
    const listeners = [
      events.phoneRequestAsk.listen((e) => onAsk(e.payload)),
      events.phoneJobEvent.listen((e) => onPhoneJob(e.payload)),
      events.phoneBatchEnd.listen((e) => onBatchEnd(e.payload)),
      events.taskProgress.listen((e) => onProgress(e.payload)),
      events.quitAsk.listen(() => useJobs.setState({ quitting: true })),
    ];
    void Promise.all(listeners)
      .then(() => commands.phoneActivity())
      .then((activity) => {
        activity?.asks.forEach((ask) => onAsk(ask));
        activity?.jobs.forEach((job) => onPhoneJob(job));
      })
      .catch(() => {});
    return () => {
      listeners.forEach((l) => void l.then((off) => off()));
    };
  }, []);
}

/** Sound, notification and fresh lists for every result, whichever job it came from. */
function useResultEffects() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { announce } = useFeedback();
  const results = useJobs((s) => s.results);
  const told = useRef(new Set<Result>());
  useEffect(() => {
    for (const result of results) {
      if (told.current.has(result)) continue;
      told.current.add(result);
      const what = result.kind ? t(`job.title.${result.kind}`) : t("job.request");
      announce(
        result.outcome === "done" || result.outcome === "warning",
        `${what}: ${t(`job.outcome.${result.outcome}`)}`,
      );
      for (const key of QUERIES) void client.invalidateQueries({ queryKey: [key] });
    }
    for (const result of told.current) {
      if (!results.includes(result)) told.current.delete(result);
    }
  }, [results, announce, client, t]);
}

/** The one place for windows about jobs: a question, then progress, then the result. */
export function JobHost() {
  useJobEvents();
  useResultEffects();
  const { asks, jobs, results, quitting } = useJobs();
  useEffect(() => {
    // Nothing is left to ask about once the last job has ended.
    if (quitting && jobs.length === 0) useJobs.setState({ quitting: false });
  }, [quitting, jobs.length]);
  const ask = asks[0];
  const result = results[0];
  if (quitting && jobs.length > 0) return <QuitDialog />;
  if (ask) return <AskDialog key={`${ask.phone}/${ask.batch}`} ask={ask} />;
  if (jobs.length > 0) return <ProgressDialog jobs={jobs} />;
  if (result) return <ResultDialog key={result.id} result={result} />;
  return null;
}
