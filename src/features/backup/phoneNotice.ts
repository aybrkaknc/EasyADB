import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";

import { commands } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";

/** Whether the question about the phone's backups is open. It only opens when asked for. */
export const usePhoneDialog = create<{
  open: boolean;
  /** Phones whose notice was removed from the bell. */
  dismissed: string[];
  setOpen: (open: boolean) => void;
  dismiss: (serial: string) => void;
}>((set) => ({
  open: false,
  dismissed: [],
  setOpen: (open) => set({ open }),
  dismiss: (serial) => set((s) => ({ open: false, dismissed: [...s.dismissed, serial] })),
}));

/** What is on the phone that is not on the PC yet, for the connected phone. */
export function usePhoneFindings() {
  const { selected } = useDevices();
  const serial = selected?.state === "device" ? selected.serial : null;
  const found = useQuery({
    queryKey: ["phoneBackups", serial],
    queryFn: () => commands.listPhoneBackups(serial!),
    enabled: serial !== null,
    staleTime: Infinity,
    retry: false,
  });
  const system = useQuery({
    queryKey: ["phoneSystem", serial],
    queryFn: () => commands.listPhoneSystem(serial!),
    enabled: serial !== null,
    staleTime: Infinity,
    retry: false,
  });
  return {
    selected,
    serial,
    fresh: (found.data ?? []).filter((b) => !b.onPc),
    files: system.data ?? [],
  };
}
