import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../app/i18n";
import type { PhoneBatchEnd, PhoneJobEvent, PhoneRequestAsk } from "../../bindings";
import { renderWithProviders } from "../../test/render";

const answer = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const cancelTask = vi.fn();
const cancelPhoneJob = vi.fn<(...args: unknown[]) => Promise<null>>();
let devices: { serial: string; state: string }[] = [];
let activity: { asks: unknown[]; jobs: unknown[] } = { asks: [], jobs: [] };
const listen = () => Promise.resolve(() => {});

vi.mock("../../bindings", () => ({
  commands: {
    getSettings: () => Promise.resolve({ sound: false, notifications: false }),
    answerPhoneRequest: (...args: unknown[]) => answer(...args),
    cancelTask: (id: string) => cancelTask(id),
    cancelPhoneJob: (...args: unknown[]) => cancelPhoneJob(...args),
    listDevices: () => Promise.resolve(devices),
    getDeviceDetails: () => Promise.resolve({ marketName: "" }),
    phoneActivity: () => Promise.resolve(activity),
    quitApp: () => Promise.resolve(null),
  },
  events: {
    phoneRequestAsk: { listen },
    phoneJobEvent: { listen },
    phoneBatchEnd: { listen },
    taskProgress: { listen },
    quitAsk: { listen },
  },
}));

const { nextLane, secondsLeft, onAsk, onBatchEnd, onPhoneJob, onProgress, runJob, useJobs } =
  await import("./store");
const { JobHost } = await import("./JobHost");

const ask = (extra: Partial<PhoneRequestAsk> = {}): PhoneRequestAsk => ({
  phone: "P",
  model: "Pixel 7",
  batch: "b",
  kind: "app",
  names: ["com.foo.bar"],
  count: 3,
  data: true,
  obb: false,
  externalData: false,
  label: "",
  seconds: 120,
  ...extra,
});

const job = (extra: Partial<PhoneJobEvent> = {}): PhoneJobEvent => ({
  phone: "P",
  model: "Pixel 7",
  batch: "b",
  index: 0,
  size: 1,
  id: "r1",
  kind: "app",
  names: ["com.foo.bar"],
  label: "",
  parts: [],
  state: "running",
  error: null,
  reason: null,
  notes: [],
  ...extra,
});

const end = (reason: PhoneBatchEnd["reason"], extra: Partial<PhoneBatchEnd> = {}) =>
  onBatchEnd({ phone: "P", batch: "b", reason, detail: "", ...extra });

const progress = (taskId: string, stage: string, item: string, current: number, total: number) =>
  onProgress({ taskId, state: "running", stage, item, current, total });

const state = () => useJobs.getState();

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useJobs.setState({ asks: [], jobs: [], results: [], quitting: false, trustOpen: false });
  answer.mockReset().mockResolvedValue(true);
  cancelTask.mockReset();
  cancelPhoneJob.mockReset().mockResolvedValue(null);
  devices = [{ serial: "S", state: "device" }];
  activity = { asks: [], jobs: [] };
});

afterEach(() => vi.useRealTimers());

describe("speed of a step", () => {
  it("comes from the last half second and not from every event", () => {
    const a = nextLane(null, 0, 1000, 0);
    const b = nextLane(a, 100, 1000, 100);
    expect(b.rate).toBe(0);
    const c = nextLane(b, 500, 1000, 1000);
    expect(c.rate).toBe(500);
    expect(secondsLeft(c)).toBe(1);
    expect(secondsLeft(a)).toBeNull();
  });

  it("starts again when the numbers fall back", () => {
    const a = nextLane(null, 900, 1000, 0);
    expect(nextLane(a, 10, 1000, 2000).rate).toBe(0);
  });
});

describe("a group of phone requests", () => {
  it("is one job and one result", () => {
    onPhoneJob(job({ size: 2 }));
    onPhoneJob(job({ size: 2, state: "done" }));
    expect(state().results).toHaveLength(0);
    onPhoneJob(job({ size: 2, index: 1, id: "r2", names: ["com.foo.two"] }));
    expect(state().jobs).toHaveLength(1);
    onPhoneJob(job({ size: 2, index: 1, id: "r2", state: "done", notes: ["data_skipped"] }));
    end("finished");
    expect(state().jobs).toHaveLength(0);
    expect(state().results).toHaveLength(1);
    expect(state().results[0]).toMatchObject({ outcome: "warning", folder: true });
    expect(state().results[0]?.items.map((i) => i.state)).toEqual(["done", "warning"]);
  });

  it("says who cancelled it and what was not tried", () => {
    onPhoneJob(job({ size: 3 }));
    onPhoneJob(job({ size: 3, state: "cancelled", reason: "phone" }));
    end("phone");
    const result = state().results[0];
    expect(result).toMatchObject({ outcome: "cancelled", reason: "Cancelled on the phone." });
    expect(result?.items.at(-1)?.name).toBe("2 not tried");
  });

  it("is not completed when the connection is lost", () => {
    onPhoneJob(job({ size: 2 }));
    onPhoneJob(
      job({
        size: 2,
        state: "failed",
        reason: "disconnected",
        error: { code: "adb_failed", detail: "x" },
      }),
    );
    end("disconnected");
    expect(state().results[0]).toMatchObject({
      outcome: "incomplete",
      reason: "The connection to the phone was lost.",
    });
  });

  it("carries the speeds of a speed test", () => {
    const speed = { kind: "speed", names: [] };
    onPhoneJob(job(speed));
    progress("phone-r1", "speed", "to_pc", 10, 100);
    expect(state().jobs[0]?.speed.to_pc?.done).toBe(10);
    onPhoneJob(
      job({ ...speed, state: "done", notes: ["speed_to_pc:9.50", "speed_to_phone:8.00"] }),
    );
    end("finished");
    expect(state().results[0]?.speed).toEqual({ toPc: 9.5, toPhone: 8 });
  });
});

describe("a question of a phone", () => {
  it("closes with a reason when the phone gives up or nobody answers", () => {
    for (const [reason, outcome] of [
      ["phone", "cancelled"],
      ["gone", "rejected"],
      ["expired", "rejected"],
      ["disconnected", "rejected"],
    ] as const) {
      useJobs.setState({ results: [] });
      onAsk(ask());
      end(reason);
      expect(state().asks).toHaveLength(0);
      expect(state().results[0]?.outcome).toBe(outcome);
    }
  });

  it("is not followed by a window when nothing was asked", () => {
    end("gone");
    expect(state().results).toHaveLength(0);
  });

  it("shows why a request was refused", () => {
    end("invalid", { batch: "", detail: "stale request" });
    expect(state().results[0]?.reason).toContain("stale request");
  });
});

describe("a job of this PC", () => {
  const spec = {
    kind: "app" as const,
    serial: "S",
    device: "Pixel 7",
    items: [
      { key: "a", name: "A" },
      { key: "b", name: "B" },
    ],
  };

  it("reports every item and offers a retry of the failed ones", async () => {
    const retry = vi.fn();
    await runJob({
      ...spec,
      run: () => Promise.resolve(null),
      report: () => [
        { key: "a", state: "done" as const },
        { key: "b", state: "failed" as const, note: "no" },
      ],
      retry,
    });
    const result = state().results[0];
    expect(result?.outcome).toBe("incomplete");
    result?.retry?.();
    expect(retry).toHaveBeenCalledWith(["b"]);
  });

  it("has no retry when all went well", async () => {
    await runJob({ ...spec, run: () => Promise.resolve(1), retry: vi.fn() });
    expect(state().results[0]).toMatchObject({ outcome: "done", retry: undefined });
  });

  it("follows the progress from item to item", async () => {
    await runJob({
      ...spec,
      run: ({ taskId }) => {
        progress(taskId, "apk", "a", 5, 10);
        expect(state().jobs[0]?.items.map((i) => i.state)).toEqual(["running", "waiting"]);
        progress(taskId, "apk", "b", 5, 10);
        expect(state().jobs[0]?.items.map((i) => i.state)).toEqual(["done", "running"]);
        return Promise.resolve(null);
      },
    });
    expect(state().results[0]?.bytes).toBe(10);
  });

  it("tells a lost phone from a failed command", async () => {
    const fail = () => Promise.reject({ code: "adb_failed", detail: "raw" });
    await runJob({ ...spec, run: fail });
    expect(state().results[0]?.reason).toContain("raw");
    devices = [];
    useJobs.setState({ results: [] });
    await runJob({ ...spec, run: fail });
    expect(state().results[0]?.reason).toBe("The connection to the phone was lost.");
  });

  it("tells who said no", async () => {
    const reasons = async (error: unknown) => {
      useJobs.setState({ results: [] });
      await runJob({ ...spec, run: () => Promise.reject(error) });
      return [state().results[0]?.outcome, state().results[0]?.reason];
    };
    expect(await reasons({ code: "cancelled", detail: "" })).toEqual([
      "cancelled",
      "Cancelled on this PC.",
    ]);
    expect(await reasons({ code: "cancelled", detail: "phone" })).toEqual([
      "cancelled",
      "Cancelled on the phone.",
    ]);
    expect((await reasons({ code: "phone_rejected", detail: "" }))[0]).toBe("rejected");
  });
});

describe("JobHost", () => {
  it("asks first, then shows progress, then the result", async () => {
    renderWithProviders(<JobHost />);
    act(() => onAsk(ask()));
    expect(await screen.findByText("The phone Pixel 7 asks for a backup")).toBeInTheDocument();
    expect(screen.getByText("and 2 more")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "This time only" }));
    expect(answer).toHaveBeenCalledWith("P", "b", "once");
    act(() => onPhoneJob(job()));
    expect(await screen.findByText("Backing up...")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelPhoneJob).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));
    expect(cancelPhoneJob).toHaveBeenCalledWith("P", "b");
    act(() => {
      onPhoneJob(job({ state: "done" }));
      end("finished");
    });
    expect(await screen.findByText("Backup completed")).toBeInTheDocument();
  });

  it("does not take Escape for an answer", async () => {
    renderWithProviders(<JobHost />);
    act(() => onAsk(ask()));
    await screen.findByText("The phone Pixel 7 asks for a backup");
    await userEvent.keyboard("{Escape}");
    expect(answer).not.toHaveBeenCalled();
    expect(screen.getByText("The phone Pixel 7 asks for a backup")).toBeInTheDocument();
  });

  it("offers only start and reject for a speed test", async () => {
    renderWithProviders(<JobHost />);
    act(() => onAsk(ask({ kind: "speed", names: [], count: 32 })));
    expect(await screen.findByRole("button", { name: "Start test" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Trust this phone" })).toBeNull();
  });

  it("finds a question that was asked before the window was ready", async () => {
    activity = { asks: [ask({ seconds: 60 })], jobs: [] };
    renderWithProviders(<JobHost />);
    expect(await screen.findByText(/Closes by itself in (1:00|0:59)/)).toBeInTheDocument();
  });

  it("closes a clean result by itself and keeps the others", () => {
    vi.useFakeTimers();
    renderWithProviders(<JobHost />);
    act(() => {
      onPhoneJob(job());
      onPhoneJob(job({ state: "done" }));
      end("finished");
    });
    act(() => void vi.advanceTimersByTime(9_000));
    expect(state().results).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(2_000));
    expect(state().results).toHaveLength(0);
    act(() => {
      onPhoneJob(job());
      onPhoneJob(job({ state: "done", notes: ["data_skipped"] }));
      end("finished");
    });
    act(() => void vi.advanceTimersByTime(60_000));
    expect(state().results).toHaveLength(1);
  });

  it("asks before quitting while a job runs", async () => {
    renderWithProviders(<JobHost />);
    act(() => {
      onPhoneJob(job());
      useJobs.setState({ quitting: true });
    });
    expect(await screen.findByText("Jobs are running")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(await screen.findByText("Backing up...")).toBeInTheDocument();
  });

  it("lists the chosen parts and says which the app does not have", async () => {
    renderWithProviders(<JobHost />);
    act(() => {
      onPhoneJob(job({ label: "TikTok", parts: ["apk", "obb", "data"] }));
      progress("phone-r1", "apk", "com.foo.bar", 1, 10);
      progress("phone-r1", "data", "com.foo.bar", 1, 10);
    });
    expect(await screen.findByText("TikTok")).toBeInTheDocument();
    expect(screen.getByText("Copying OBB - none")).toBeInTheDocument();
    expect(screen.getByText("Copying data")).toBeInTheDocument();
    expect(screen.queryByText("Copying external data")).toBeNull();
  });
});
