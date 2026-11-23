import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

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
  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-line bg-black">
      <div data-tauri-drag-region className="flex flex-1 items-center gap-2 px-4">
        <span data-tauri-drag-region className="size-2 bg-neon" />
        <span data-tauri-drag-region className="heading text-xs">
          EasyADB
        </span>
      </div>
      <div className="flex items-center px-2">
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
