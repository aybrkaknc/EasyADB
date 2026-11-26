import { useEffect } from "react";
import type { TFunction } from "i18next";
import { create } from "zustand";

import i18n from "../../app/i18n";
import {
  commands,
  type PhoneBatchEnd,
  type PhoneJobEvent,
  type PhoneRequestAsk,
  type TaskProgress,
} from "../../bindings";
import { errorText, isAppError } from "../lib/errors";
import { appName } from "../lib/format";

export type JobKind =
  | "app"
  | "folders"
  | "pull"
  | "speed"
  | "phoneData"
  | "restore"
  | "systemRestore"
  | "push"
  | "deleteCopies";

export type ItemState = "waiting" | "running" | "done" | "warning" | "failed" | "cancelled";

export interface JobItem {
  key: string;
  name: string;
  state: ItemState;
  note?: string;
}

/** One step of a job and how fast it moves. */
export interface Lane {
  done: number;
  total: number;
  /** Bytes per second over the last half second or more. */
  rate: number;
  sampleAt: number;
  sampleDone: number;
}

export interface SpeedResult {
  toPc: number | null;
  toPhone: number | null;
}

export interface Job {
  id: string;
  /** The task whose progress events belong to this job now. */
  taskId: string;
  kind: JobKind;
  device: string;
  serial: string;
  items: JobItem[];
  /** Filled in as the phone sends more of its group. */
  size: number;
  stage: string;
  item: string;
  lane: Lane | null;
  /** Both directions of a speed test. */
  speed: Record<string, Lane>;
  /** Bytes of the steps that ended. */
  moved: number;
  startedAt: number;
  cancelling: boolean;
  cancelled: boolean;
  cancel: () => void;
}

export type Outcome = "done" | "warning" | "incomplete" | "cancelled" | "rejected";

export interface Result {
  id: string;
  kind: JobKind | null;
  device: string;
  outcome: Outcome;
  reason?: string;
  items: JobItem[];
  seconds: number;
  bytes: number;
  speed?: SpeedResult;
  retry?: () => void;
  /** Whether the files it made are in the backup folder. */
  folder: boolean;
}

export interface Ask extends PhoneRequestAsk {
  deadline: number;
}

interface JobStore {
  asks: Ask[];
  jobs: Job[];
  results: Result[];
  quitting: boolean;
  /** Another window asks something now. */
  trustOpen: boolean;
  /** Streams, commands and transfers that use a connection outside a job window. */
  holds: number;
}

export const useJobs = create<JobStore>(() => ({
  asks: [],
  jobs: [],
  results: [],
  quitting: false,
  trustOpen: false,
  holds: 0,
}));

// Looked up per call, so that a change of language applies at once.
const t = ((...args: Parameters<TFunction>) => i18n.t(...args)) as unknown as TFunction;

/** True while no job window is on the screen. */
export function useIdle() {
  return useJobs(
    (s) => s.asks.length === 0 && s.jobs.length === 0 && s.results.length === 0 && !s.quitting,
  );
}

/** Marks the connection as in use while `active`. */
export function useHold(active: boolean) {
  useEffect(() => {
    if (!active) return;
    useJobs.setState((s) => ({ holds: s.holds + 1 }));
    return () => useJobs.setState((s) => ({ holds: s.holds - 1 }));
  }, [active]);
}

/** True while nothing uses a phone, so the selected connection may change. */
export function useDeviceFree() {
  const idle = useIdle();
  return useJobs((s) => s.holds === 0) && idle;
}

const SAMPLE_MS = 500;

/** The next state of a step after one progress event. */
export function nextLane(prev: Lane | null, done: number, total: number, now: number): Lane {
  if (!prev || done < prev.done) {
    return { done, total, rate: 0, sampleAt: now, sampleDone: done };
  }
  const ms = now - prev.sampleAt;
  if (ms < SAMPLE_MS) return { ...prev, done, total };
  return {
    done,
    total,
    rate: ((done - prev.sampleDone) * 1000) / ms,
    sampleAt: now,
    sampleDone: done,
  };
}

/** Seconds left for the step, or null while its speed is not known. */
export function secondsLeft(lane: Lane): number | null {
  if (lane.rate <= 0 || lane.total <= lane.done) return null;
  return Math.ceil((lane.total - lane.done) / lane.rate);
}

/** Steps whose numbers are bytes that travel. */
const MOVES = ["apk", "obb", "data", "files", "pull", "push"];

/** The steps of each kind of job, in the order they come. */
export const STEPS: Record<JobKind, string[]> = {
  app: ["apk", "obb", "data"],
  folders: ["files"],
  pull: ["pull"],
  speed: [],
  phoneData: ["phone_wait", "phone_approval", "files", "pull"],
  restore: ["verify", "install", "obb", "permissions", "data"],
  systemRestore: ["system"],
  push: ["push"],
  deleteCopies: ["verify"],
};

const patchJob = (id: string, change: (job: Job) => Job) =>
  useJobs.setState((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? change(j) : j)) }));

/** Marks the item that the progress names as the one being worked on. */
function activate(items: JobItem[], key: string): JobItem[] {
  if (!items.some((i) => i.key === key && i.state !== "running")) return items;
  return items.map((i) =>
    i.key === key && i.state === "waiting"
      ? { ...i, state: "running" }
      : i.state === "running" && i.key !== key
        ? { ...i, state: "done" }
        : i,
  );
}

export function onProgress(p: TaskProgress, now = Date.now()) {
  if (p.state !== "running") return;
  const job = useJobs.getState().jobs.find((j) => j.taskId === p.taskId);
  if (!job) return;
  const done = p.current ?? 0;
  const total = p.total ?? 0;
  patchJob(job.id, (j) => {
    if (j.kind === "speed") {
      return {
        ...j,
        stage: p.stage,
        item: p.item,
        speed: { ...j.speed, [p.item]: nextLane(j.speed[p.item] ?? null, done, total, now) },
      };
    }
    const samePart = j.item === p.item && MOVES.includes(j.stage) && MOVES.includes(p.stage);
    const ended = !samePart && j.lane && MOVES.includes(j.stage) ? j.lane.done : 0;
    return {
      ...j,
      stage: p.stage,
      item: p.item,
      items: activate(j.items, p.item),
      lane: total > 0 ? nextLane(samePart ? j.lane : null, done, total, now) : null,
      moved: j.moved + ended,
    };
  });
}

function movedBytes(job: Job): number {
  if (job.kind === "speed") return Object.values(job.speed).reduce((sum, l) => sum + l.done, 0);
  return job.moved + (job.lane && MOVES.includes(job.stage) ? job.lane.done : 0);
}

function outcomeOf(items: JobItem[]): Outcome {
  if (items.some((i) => i.state === "failed" || i.state === "waiting" || i.state === "running")) {
    return "incomplete";
  }
  return items.some((i) => i.state === "warning") ? "warning" : "done";
}

function finish(
  id: string,
  end: {
    outcome?: Outcome;
    reason?: string;
    items?: JobItem[];
    speed?: SpeedResult;
    retry?: () => void;
  },
) {
  const job = useJobs.getState().jobs.find((j) => j.id === id);
  if (!job) return;
  const items = end.items ?? job.items;
  const result: Result = {
    id: job.id,
    kind: job.kind,
    device: job.device,
    outcome: end.outcome ?? outcomeOf(items),
    reason: end.reason,
    items,
    seconds: Math.max(0, Math.round((Date.now() - job.startedAt) / 1000)),
    bytes: movedBytes(job),
    speed: end.speed,
    retry: end.retry,
    folder:
      ["app", "folders", "pull", "phoneData"].includes(job.kind) &&
      items.some((i) => i.state === "done" || i.state === "warning"),
  };
  useJobs.setState((s) => ({
    jobs: s.jobs.filter((j) => j.id !== id),
    results: [...s.results.filter((r) => r.id !== id), result],
  }));
}

/** Adds a result without a job, for a request that never became one. */
function notice(id: string, device: string, outcome: Outcome, reason: string, kind?: JobKind) {
  const result: Result = {
    id,
    kind: kind ?? null,
    device,
    outcome,
    reason,
    items: [],
    seconds: 0,
    bytes: 0,
    folder: false,
  };
  useJobs.setState((s) => ({ results: [...s.results.filter((r) => r.id !== id), result] }));
}

export function dismissResult(id: string) {
  useJobs.setState((s) => ({ results: s.results.filter((r) => r.id !== id) }));
}

// What phones ask for.

const batchId = (phone: string, batch: string) => `phone:${phone}/${batch}`;
/** Models of the phones that were heard of, for windows about a phone that is gone. */
const models = new Map<string, string>();

export function onAsk(ask: PhoneRequestAsk, now = Date.now()) {
  models.set(ask.phone, ask.model);
  useJobs.setState((s) => ({
    asks: [
      ...s.asks.filter((a) => !(a.phone === ask.phone && a.batch === ask.batch)),
      { ...ask, deadline: now + ask.seconds * 1000 },
    ],
  }));
}

/** Groups the user accepted, so that one that never starts is not lost without a word. */
const accepted = new Map<string, Ask>();

export function accept(ask: Ask) {
  accepted.set(batchId(ask.phone, ask.batch), ask);
}

export function removeAsk(phone: string, batch: string): Ask | undefined {
  const ask = useJobs.getState().asks.find((a) => a.phone === phone && a.batch === batch);
  if (ask) useJobs.setState((s) => ({ asks: s.asks.filter((a) => a !== ask) }));
  return ask;
}

function nameOf(e: PhoneJobEvent): string {
  if (e.kind === "app") return appName({ package: e.names[0] ?? "" });
  if (e.kind === "speed") return t("job.title.speed");
  return e.names.join(", ");
}

/** Reads the speeds from the notes, e.g. `speed_to_pc:12.34`, in megabytes per second. */
export function speedFrom(notes: string[]): SpeedResult {
  const value = (name: string) => {
    const note = notes.find((n) => n.startsWith(`${name}:`));
    const number = note ? Number(note.slice(name.length + 1)) : NaN;
    return Number.isFinite(number) ? number : null;
  };
  return { toPc: value("speed_to_pc"), toPhone: value("speed_to_phone") };
}

function noteText(notes: string[]): string | undefined {
  const lines = notes
    .filter((n) => n === "data_skipped" || n.startsWith("data_failed:"))
    .map((n) =>
      n === "data_skipped"
        ? t("job.note.dataSkipped")
        : t("job.note.dataFailed", { detail: n.slice("data_failed:".length) }),
    );
  return lines.length ? lines.join("\n") : undefined;
}

/** The speeds of the speed test that ended last, kept until its group ends. */
const speeds = new Map<string, SpeedResult>();

export function onPhoneJob(e: PhoneJobEvent, now = Date.now()) {
  models.set(e.phone, e.model);
  removeAsk(e.phone, e.batch);
  const id = batchId(e.phone, e.batch);
  accepted.delete(id);
  if (!useJobs.getState().jobs.some((j) => j.id === id)) {
    const job: Job = {
      id,
      taskId: `phone-${e.id}`,
      kind: e.kind as JobKind,
      device: e.model || e.phone,
      serial: "",
      items: [],
      size: e.size,
      stage: "prepare",
      item: "",
      lane: null,
      speed: {},
      moved: 0,
      startedAt: now,
      cancelling: false,
      cancelled: false,
      cancel: () => void commands.cancelPhoneJob(e.phone, e.batch).catch(() => {}),
    };
    useJobs.setState((s) => ({ jobs: [...s.jobs, job] }));
  }
  const state: ItemState = e.state === "done" ? (noteText(e.notes) ? "warning" : "done") : e.state;
  const item: JobItem = {
    key: e.id,
    name: nameOf(e),
    state,
    note:
      e.state === "failed"
        ? e.reason === "disconnected"
          ? t("job.reason.disconnected")
          : errorText(t, e.error)
        : noteText(e.notes),
  };
  if (e.kind === "speed" && e.state === "done") speeds.set(id, speedFrom(e.notes));
  patchJob(id, (j) => ({
    ...j,
    taskId: `phone-${e.id}`,
    stage: e.state === "running" ? "prepare" : j.stage,
    moved: e.state === "running" ? j.moved : movedBytes(j),
    lane: e.state === "running" ? j.lane : null,
    items: j.items.some((i) => i.key === e.id)
      ? j.items.map((i) => (i.key === e.id ? item : i))
      : [...j.items, item],
  }));
}

export function onBatchEnd(e: PhoneBatchEnd) {
  const id = batchId(e.phone, e.batch);
  const device = models.get(e.phone) ?? e.phone;
  const ask = removeAsk(e.phone, e.batch) ?? accepted.get(id);
  accepted.delete(id);
  const job = useJobs.getState().jobs.find((j) => j.id === id);
  if (!job) {
    // The user's own "no" needs no window.
    if (e.reason === "rejected" || (!ask && e.reason !== "invalid" && e.reason !== "expired")) {
      return;
    }
    const outcome: Outcome = e.reason === "phone" ? "cancelled" : "rejected";
    const detail = e.detail ? ` ${e.detail}` : "";
    const key = e.batch ? id : `${id}${Date.now()}`;
    notice(key, device, outcome, t(`job.reason.${e.reason}`) + detail, ask?.kind as JobKind);
    return;
  }
  const speed = speeds.get(id);
  speeds.delete(id);
  // What the phone never sent is named by its number only.
  const missing = Math.max(0, job.size - job.items.length);
  const items = [...job.items];
  if (missing > 0) {
    items.push({
      key: "missing",
      name: t("job.missing", { count: missing }),
      state: "waiting",
    });
  }
  if (e.reason === "finished") {
    finish(id, { speed });
  } else {
    const cancelled = e.reason === "phone" || e.reason === "pc";
    finish(id, {
      outcome: cancelled ? "cancelled" : "incomplete",
      reason: t(`job.reason.${e.reason}`),
      items,
    });
  }
}

// Jobs started on this PC.

export interface JobContext {
  taskId: string;
  /** True once the user cancelled; a job of many commands stops between them. */
  isCancelled: () => boolean;
  mark: (key: string, state: ItemState, note?: string) => void;
}

export interface JobSpec<T> {
  kind: JobKind;
  serial: string;
  device: string;
  items: { key: string; name: string }[];
  run: (ctx: JobContext) => Promise<T>;
  /** How each item ended, from what the command returned. */
  report?: (value: T) => { key: string; state: ItemState; note?: string; name?: string }[];
  speed?: (value: T) => SpeedResult;
  /** Starts the job again with the items that did not make it. */
  retry?: (keys: string[]) => void;
}

/** Why a job of this PC stopped, in words. */
async function stopReason(error: unknown, serial: string): Promise<[Outcome, string]> {
  if (isAppError(error)) {
    if (error.code === "cancelled") {
      return ["cancelled", t(`job.reason.${error.detail === "phone" ? "phone" : "pc"}`)];
    }
    if (error.code === "phone_rejected") return ["rejected", t("errors.phone_rejected")];
    if (error.code === "phone_expired") return ["rejected", t("errors.phone_expired")];
  }
  const connected = await commands
    .listDevices()
    .then((list) => list.some((d) => d.serial === serial && d.state === "device"))
    .catch(() => true);
  return ["incomplete", connected ? errorText(t, error) : t("job.reason.disconnected")];
}

/** Runs a job with a progress window and a result window. Returns null when it failed. */
export async function runJob<T>(spec: JobSpec<T>): Promise<T | null> {
  const taskId = crypto.randomUUID();
  const id = `pc:${taskId}`;
  const job: Job = {
    id,
    taskId,
    kind: spec.kind,
    device: spec.device,
    serial: spec.serial,
    items: spec.items.map((i) => ({ ...i, state: "waiting" })),
    size: spec.items.length,
    stage: "",
    item: "",
    lane: null,
    speed: {},
    moved: 0,
    startedAt: Date.now(),
    cancelling: false,
    cancelled: false,
    cancel: () => {
      patchJob(id, (j) => ({ ...j, cancelled: true }));
      void commands.cancelTask(taskId);
    },
  };
  useJobs.setState((s) => ({ jobs: [...s.jobs, job] }));
  const current = () => useJobs.getState().jobs.find((j) => j.id === id);
  const mark: JobContext["mark"] = (key, state, note) =>
    patchJob(id, (j) => ({
      ...j,
      items: j.items.map((i) => (i.key === key ? { ...i, state, note } : i)),
    }));
  const retryOf = (items: JobItem[]) => {
    const keys = items.filter((i) => !["done", "warning"].includes(i.state)).map((i) => i.key);
    return spec.retry && keys.length > 0 ? () => spec.retry?.(keys) : undefined;
  };
  try {
    const value = await spec.run({
      taskId,
      isCancelled: () => current()?.cancelled ?? true,
      mark,
    });
    const report = new Map(spec.report?.(value).map((r) => [r.key, r]));
    const seen = current()?.items ?? [];
    const items: JobItem[] = seen.map((i): JobItem => {
      const r = report.get(i.key);
      report.delete(i.key);
      if (r) return { ...i, state: r.state, note: r.note ?? i.note, name: r.name ?? i.name };
      // Without a report of its own an item that was not marked went well.
      return spec.report || i.state === "failed" || i.state === "warning"
        ? i
        : { ...i, state: "done" };
    });
    for (const r of report.values()) {
      items.push({ key: r.key, name: r.name ?? r.key, state: r.state, note: r.note });
    }
    finish(id, { items, speed: spec.speed?.(value), retry: retryOf(items) });
    return value;
  } catch (error) {
    const [outcome, reason] = await stopReason(error, spec.serial);
    const items = (current()?.items ?? []).map((i): JobItem =>
      i.state === "running" ? { ...i, state: outcome === "cancelled" ? "cancelled" : "failed" } : i,
    );
    finish(id, { outcome, reason, items, retry: retryOf(items) });
    return null;
  }
}

/** Outcomes of a command that works through a list, as job items. */
export function reportOutcomes(
  outcomes: { id: string; error: unknown }[],
  name?: (id: string) => string,
) {
  return outcomes.map((o) => ({
    key: o.id,
    name: name?.(o.id),
    state: (o.error ? "failed" : "done") as ItemState,
    note: o.error ? errorText(t, o.error) : undefined,
  }));
}
