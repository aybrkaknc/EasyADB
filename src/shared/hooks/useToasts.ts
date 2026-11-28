import { create } from "zustand";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: ToastAction;
}

export interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastStore {
  toasts: Toast[];
  push: (kind: ToastKind, text: string, action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (kind, text, action) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text, action }] }));
    // Something to press, or several lines to read, takes longer.
    const ms = action || text.includes("\n") ? 15_000 : 6000;
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
