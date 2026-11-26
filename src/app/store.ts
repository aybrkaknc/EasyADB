import { create } from "zustand";

export type ModuleId =
  "device" | "debugging" | "backup" | "debloat" | "terminal" | "files" | "settings";

export const MODULES: ModuleId[] = [
  "device",
  "debugging",
  "backup",
  "debloat",
  "terminal",
  "files",
  "settings",
];

interface AppStore {
  module: ModuleId;
  serial: string | null;
  /** The user picked a wireless connection while the cable was plugged in. */
  pinned: boolean;
  setModule: (module: ModuleId) => void;
  setSerial: (serial: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  module: "device",
  serial: null,
  pinned: false,
  setModule: (module) => set({ module }),
  // A connection the user chose is kept even if a cable could take over.
  setSerial: (serial) => set({ serial, pinned: true }),
}));
