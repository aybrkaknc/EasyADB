import { Archive, Eraser, FolderOpen, type LucideIcon, Settings, Smartphone } from "lucide-react";

import type { ModuleId } from "./store";

export const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  device: Smartphone,
  backup: Archive,
  debloat: Eraser,
  files: FolderOpen,
  settings: Settings,
};
