import { create } from "zustand";

export type ModuleId = "device" | "backup" | "debloat" | "files" | "settings";

export const MODULES: ModuleId[] = ["device", "backup", "debloat", "files", "settings"];

export const SETTINGS_TABS = ["general", "debugging", "terminal", "performance", "logcat"] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

interface AppStore {
  module: ModuleId;
  settingsTab: SettingsTab;
  serial: string | null;
  /** The user picked a wireless connection while the cable was plugged in. */
  pinned: boolean;
  /** The module rail shows the module names beside its icons. */
  railOpen: boolean;
  toggleRail: () => void;
  setModule: (module: ModuleId) => void;
  openSettings: (tab: SettingsTab) => void;
  setSerial: (serial: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  module: "device",
  settingsTab: "general",
  serial: null,
  pinned: false,
  railOpen: false,
  toggleRail: () => set((s) => ({ railOpen: !s.railOpen })),
  // Every visit of the settings starts at the general tab.
  setModule: (module) => set({ module, settingsTab: "general" }),
  openSettings: (settingsTab) => set({ module: "settings", settingsTab }),
  // A connection the user chose is kept even if a cable could take over.
  setSerial: (serial) => set({ serial, pinned: true }),
}));
