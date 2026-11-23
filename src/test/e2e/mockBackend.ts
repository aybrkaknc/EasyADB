// In-memory stand-in for the Rust backend, loaded only in `vite --mode e2e`.
// The scenario comes from the URL, e.g. `/?scenario=nodevice`.
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

type Args = Record<string, unknown>;

const scenario = new URLSearchParams(location.search).get("scenario") ?? "default";

const device = {
  serial: "R58M123",
  state: scenario === "unauthorized" ? "unauthorized" : "device",
  kind: "usb",
  model: "Pixel 7",
  product: "panther",
};

const apps = [
  {
    package: "com.spotify.music",
    label: "Spotify",
    system: false,
    disabled: false,
    installed: true,
  },
  { package: "org.mozilla.firefox", label: null, system: false, disabled: false, installed: true },
  { package: "com.facebook.services", label: null, system: true, disabled: false, installed: true },
  { package: "com.android.systemui", label: null, system: true, disabled: false, installed: true },
  {
    package: "com.old.removed",
    label: "Old Removed",
    system: true,
    disabled: false,
    installed: false,
  },
  {
    package: "com.old.disabled",
    label: "Old Disabled",
    system: true,
    disabled: true,
    installed: true,
  },
];

const debloatInfo: Record<string, unknown> = {
  "com.facebook.services": {
    list: "Misc",
    description: "Facebook services preinstalled by the OEM.",
    removal: "Recommended",
    dependencies: [],
    neededBy: [],
  },
  "com.android.systemui": {
    list: "Aosp",
    description: "System UI. Removing it bootloops the device.",
    removal: "Unsafe",
    dependencies: [],
    neededBy: [],
  },
};

const state = {
  settings: {
    language: null as string | null,
    backupDir: null,
    notifications: false,
    sound: false,
    confirmDestructive: true,
    fileLogging: true,
    verifyHashOnRestore: false,
    closeToTray: true,
  },
  backups: [] as Args[],
  calls: [] as { cmd: string; args: Args }[],
};

(window as unknown as { __calls: typeof state.calls }).__calls = state.calls;

const handlers: Record<string, (args: Args) => unknown> = {
  list_devices: () => (scenario === "nodevice" ? [] : [device]),
  check_device_root: () => scenario !== "noroot",
  open_web_search: () => null,
  get_settings: () => state.settings,
  save_settings: (a) => {
    state.settings = a.settings as typeof state.settings;
    return null;
  },
  get_backup_root: () => "C:\\Users\\Test\\Documents\\EasyADB\\Backups",
  get_device_details: () => ({
    serial: device.serial,
    model: "Pixel 7",
    manufacturer: "Google",
    androidVersion: "14",
    sdk: 34,
    build: "UQ1A.240205.002",
    abi: "arm64-v8a",
    hasSu: true,
    bootloaderLocked: false,
    verifiedBoot: "orange",
    selinux: "Enforcing",
  }),
  list_device_apps: () => apps,
  get_app_sizes: (a) =>
    (a.packages as string[]).map((p) => ({ package: p, apkBytes: 25_000_000, obbBytes: 0 })),
  list_backups: () => state.backups,
  start_backup: async (a) => {
    const packages = a.packages as string[];
    await emit("task-progress", {
      taskId: a.taskId,
      state: "running",
      stage: "apk",
      item: packages[0],
      current: 1,
      total: 2,
    });
    for (const pkg of packages) {
      state.backups.unshift({
        id: `${pkg}_20260101-120000`,
        path: `C:\\Backups\\${pkg}_20260101-120000`,
        package: pkg,
        label: apps.find((x) => x.package === pkg)?.label ?? null,
        versionName: "1.0",
        createdAt: "2026-01-01T12:00:00+03:00",
        totalBytes: 25_000_000,
        hasObb: false,
        hasData: false,
        permissionCount: 3,
        deviceModel: "Pixel 7",
      });
    }
    const noRoot = scenario === "noroot" && (a.options as { includeData: boolean }).includeData;
    return packages.map((pkg) => ({
      package: pkg,
      id: `${pkg}_20260101-120000`,
      error: null,
      dataSkipped: noRoot,
    }));
  },
  start_restore: (a) => ({
    data:
      scenario === "noroot" && (a.options as { restoreData: boolean }).restoreData
        ? "no_root"
        : "not_requested",
    detail: null,
    permissionsGranted: 0,
    permissionsTotal: 0,
    specialFailed: 0,
  }),
  list_debloat_apps: () => apps.map((app) => ({ app, info: debloatInfo[app.package] ?? null })),
  apply_debloat: (a) =>
    (a.entries as { package: string }[]).map((e) => ({ package: e.package, error: null })),
  wireless_saved: () => [],
  "plugin:app|version": () => "0.2.0",
  "plugin:notification|is_permission_granted": () => false,
  "plugin:notification|request_permission": () => "denied",
};

export function install() {
  mockWindows("main");
  mockIPC(
    (cmd, payload) => {
      const args = (payload ?? {}) as Args;
      state.calls.push({ cmd, args });
      const handler = handlers[cmd];
      return handler ? handler(args) : null;
    },
    { shouldMockEvents: true },
  );
}
