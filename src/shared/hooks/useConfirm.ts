import { create } from "zustand";

import { useSettings } from "./useSettings";

interface ConfirmRequest {
  message: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export const useConfirmStore = create<{
  request: ConfirmRequest | null;
  set: (r: ConfirmRequest | null) => void;
}>((set) => ({ request: null, set: (request) => set({ request }) }));

/** Promise-based confirmation that respects the "ask before irreversible actions" setting. */
export function useConfirm() {
  const settings = useSettings();
  const set = useConfirmStore((s) => s.set);
  return (message: string, danger = true): Promise<boolean> => {
    if (!settings.confirmDestructive) return Promise.resolve(true);
    return new Promise((resolve) => set({ message, danger, resolve }));
  };
}
