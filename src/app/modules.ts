import {
  Archive,
  Bug,
  Eraser,
  FolderOpen,
  type LucideIcon,
  Settings,
  Smartphone,
  SquareTerminal,
} from "lucide-react";

import type { ModuleId } from "./store";

export const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  device: Smartphone,
  debugging: Bug,
  backup: Archive,
  debloat: Eraser,
  terminal: SquareTerminal,
  files: FolderOpen,
  settings: Settings,
};
