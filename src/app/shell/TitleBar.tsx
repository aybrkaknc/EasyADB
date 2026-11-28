import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, PanelLeftClose, PanelLeftOpen, Square, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PhoneNoticeBell } from "../../features/backup/PhoneNoticeBell";
import { useAppStore } from "../store";
import { DeviceSelector } from "./DeviceSelector";

const appWindow = () => getCurrentWindow();

function WindowButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-full w-11 items-center justify-center text-white/60 transition-colors ${danger ? "hover:bg-danger hover:text-black" : "hover:bg-white/10 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const { t } = useTranslation();
  const railOpen = useAppStore((s) => s.railOpen);
  const toggleRail = useAppStore((s) => s.toggleRail);
  const label = t(railOpen ? "titlebar.railCollapse" : "titlebar.railExpand");
  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-line bg-black">
      <div
        className={`flex shrink-0 items-center justify-center border-r border-line transition-[width] duration-150 ${railOpen ? "w-56" : "w-14"}`}
      >
        <button
          type="button"
          aria-label={label}
          title={label}
          aria-expanded={railOpen}
          onClick={toggleRail}
          className="flex size-8 items-center justify-center text-neon/70 transition-colors hover:text-neon"
        >
          {railOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
      </div>
      <div data-tauri-drag-region className="flex flex-1 items-center gap-2 px-4">
        <span data-tauri-drag-region className="size-2 bg-neon" />
        <span data-tauri-drag-region className="heading text-xs">
          EasyADB
        </span>
      </div>
      <div className="flex items-center gap-2 px-2">
        <PhoneNoticeBell />
        <span aria-hidden className="h-5 w-px bg-line" />
        <DeviceSelector />
      </div>
      <WindowButton label={t("titlebar.minimize")} onClick={() => void appWindow().minimize()}>
        <Minus className="size-4" />
      </WindowButton>
      <WindowButton
        label={t("titlebar.maximize")}
        onClick={() => void appWindow().toggleMaximize()}
      >
        <Square className="size-3.5" />
      </WindowButton>
      <WindowButton label={t("titlebar.close")} onClick={() => void appWindow().close()} danger>
        <X className="size-4" />
      </WindowButton>
    </div>
  );
}
