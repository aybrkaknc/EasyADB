import { create } from "zustand";

export type ModuleId =
  | "device"
  | "backup"
  | "debloat"
  | "terminal"
  | "files"
  | "logcat"
  | "performance"
  | "wireless"
  | "settings";

export const MODULES: ModuleId[] = [
  "device",
  "backup",
  "debloat",
  "terminal",
  "files",
  "logcat",
  "performance",
  "wireless",
  "settings",
];

interface AppStore {
  module: ModuleId;
  serial: string | null;
  setModule: (module: ModuleId) => void;
  setSerial: (serial: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  module: "device",
  serial: null,
  setModule: (module) => set({ module }),
  setSerial: (serial) => set({ serial }),
}));
