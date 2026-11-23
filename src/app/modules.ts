import {
  Activity,
  Archive,
  Eraser,
  FolderOpen,
  type LucideIcon,
  ScrollText,
  Settings,
  Smartphone,
  SquareTerminal,
  Wifi,
} from "lucide-react";

import type { ModuleId } from "./store";

export const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  device: Smartphone,
  backup: Archive,
  debloat: Eraser,
  terminal: SquareTerminal,
  files: FolderOpen,
  logcat: ScrollText,
  performance: Activity,
  wireless: Wifi,
  settings: Settings,
};
