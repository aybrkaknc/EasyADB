import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../app/i18n";
import { useAppStore } from "../app/store";
import type { DeviceEntry } from "../bindings";
import { renderWithProviders } from "../test/render";

const listDevices = vi.fn<() => Promise<DeviceEntry[]>>();
const cancelTask = vi.fn();
let confirmDestructive = true;
let progressListener: ((e: { payload: unknown }) => void) | null = null;

vi.mock("../bindings", () => ({
  commands: {
    listDevices: () => listDevices(),
    getSettings: () => Promise.resolve({ confirmDestructive }),
    cancelTask: (id: string) => cancelTask(id),
  },
  events: {
    taskProgress: {
      listen: (cb: (e: { payload: unknown }) => void) => {
        progressListener = cb;
        return Promise.resolve(() => (progressListener = null));
      },
    },
  },
}));

const { DeviceGuard } = await import("./ui/DeviceGuard");
const { useSelection } = await import("./hooks/useSelection");
const { useTask } = await import("./hooks/useTask");
const { useConfirm } = await import("./hooks/useConfirm");
const { ConfirmHost } = await import("./ui/Dialog");
const { FilterChips } = await import("./ui/Controls");

const device = (state: DeviceEntry["state"]): DeviceEntry => ({
  serial: "ABC",
  state,
  kind: "usb",
  model: "Pixel 7",
  product: null,
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useAppStore.setState({ serial: null });
  confirmDestructive = true;
  listDevices.mockReset();
  cancelTask.mockReset();
});

describe("DeviceGuard", () => {
  const child = (d: DeviceEntry) => <p>ready {d.model}</p>;

  it("shows the connection guide without devices", async () => {
    listDevices.mockResolvedValue([]);
    renderWithProviders(<DeviceGuard>{child}</DeviceGuard>);
    expect(await screen.findByText("No device connected")).toBeInTheDocument();
  });

  it("guides through authorization and offline states", async () => {
    listDevices.mockResolvedValue([device("unauthorized")]);
    renderWithProviders(<DeviceGuard>{child}</DeviceGuard>);
    expect(await screen.findByText("Authorization needed")).toBeInTheDocument();
  });

  it("explains wrong modes and renders children for ready devices", async () => {
    listDevices.mockResolvedValue([device("recovery")]);
    const { unmount } = renderWithProviders(<DeviceGuard>{child}</DeviceGuard>);
    expect(await screen.findByText(/in Recovery mode/)).toBeInTheDocument();
    unmount();

    listDevices.mockResolvedValue([device("device")]);
    renderWithProviders(<DeviceGuard>{child}</DeviceGuard>);
    expect(await screen.findByText("ready Pixel 7")).toBeInTheDocument();
  });

  it("shows the guide in Turkish", async () => {
    await i18n.changeLanguage("tr");
    listDevices.mockResolvedValue([]);
    renderWithProviders(<DeviceGuard>{child}</DeviceGuard>);
    expect(await screen.findByText("Bağlı cihaz yok")).toBeInTheDocument();
  });
});

describe("useSelection", () => {
  it("toggles, selects all and clears", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("a"));
    act(() => result.current.setAll(["b", "c"], true));
    expect(result.current.count).toBe(3);
    act(() => result.current.toggle("a"));
    act(() => result.current.setAll(["b"], false));
    expect(result.current.ids).toEqual(["c"]);
    act(() => result.current.replace(["x", "y"]));
    expect(result.current.has("x")).toBe(true);
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });
});

describe("useTask", () => {
  it("tracks progress for its own task and cancels it", async () => {
    const { result } = renderHook(() => useTask());
    let finish: (v: string) => void = () => {};
    let promise: Promise<string> = Promise.resolve("");
    let id = "";
    await act(async () => {
      promise = result.current.run((taskId) => {
        id = taskId;
        return new Promise<string>((resolve) => (finish = resolve));
      });
      await Promise.resolve();
    });
    expect(result.current.running).toBe(true);

    act(() => progressListener?.({ payload: { taskId: "other", state: "running", stage: "apk" } }));
    expect(result.current.progress).toBe(null);
    act(() =>
      progressListener?.({
        payload: { taskId: id, state: "running", stage: "apk", current: 1, total: 2 },
      }),
    );
    expect(result.current.progress?.stage).toBe("apk");

    act(() => result.current.cancel());
    expect(cancelTask).toHaveBeenCalledWith(id);

    await act(async () => {
      finish("ok");
      await promise;
    });
    expect(result.current.running).toBe(false);
    expect(progressListener).toBe(null);
  });
});

describe("confirm dialog", () => {
  it("resolves with the user's answer", async () => {
    listDevices.mockResolvedValue([]);
    const answers: boolean[] = [];
    function Asker() {
      const confirm = useConfirm();
      return (
        <button
          type="button"
          onClick={() => void confirm("Delete it?").then((ok) => answers.push(ok))}
        >
          ask
        </button>
      );
    }
    renderWithProviders(
      <>
        <Asker />
        <ConfirmHost />
      </>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByText("ask"));
    expect(await screen.findByText("Delete it?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await user.click(screen.getByText("ask"));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(answers).toEqual([true, false]);
  });

  it("skips the dialog when confirmations are turned off", async () => {
    const answers: boolean[] = [];
    function Asker() {
      const confirm = useConfirm();
      return (
        <button
          type="button"
          onClick={() => void confirm("Delete it?").then((ok) => answers.push(ok))}
        >
          ask
        </button>
      );
    }
    confirmDestructive = false;
    const { client } = renderWithProviders(<Asker />);
    await waitFor(() => expect(client.getQueryData(["settings"])).toBeDefined());
    await userEvent.setup().click(screen.getByText("ask"));
    await waitFor(() => expect(answers).toEqual([true]));
  });
});

describe("FilterChips", () => {
  it("marks the active option and reports changes", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FilterChips
        value="a"
        onChange={onChange}
        options={[
          { value: "a", label: "Alpha", count: 2 },
          { value: "b", label: "Beta" },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: /Alpha/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.setup().click(screen.getByRole("radio", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
