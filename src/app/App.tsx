import { useQueryClient } from "@tanstack/react-query";
import { type ComponentType, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { commands } from "../bindings";
import { BackupView } from "../features/backup/BackupView";
import { DebloatView } from "../features/debloat/DebloatView";
import { DeviceView } from "../features/device/DeviceView";
import { FilesView } from "../features/files/FilesView";
import { LogcatView } from "../features/logcat/LogcatView";
import { PerformanceView } from "../features/performance/PerformanceView";
import { SettingsView } from "../features/settings/SettingsView";
import { TerminalView } from "../features/terminal/TerminalView";
import { WirelessView } from "../features/wireless/WirelessView";
import { useSettings } from "../shared/hooks/useSettings";
import { ConfirmHost } from "../shared/ui/Dialog";
import { Toaster } from "../shared/ui/Feedback";
import { resolveLanguage } from "./i18n";
import { IconRail } from "./shell/IconRail";
import { TitleBar } from "./shell/TitleBar";
import { MODULES, type ModuleId, useAppStore } from "./store";

const VIEWS: Record<ModuleId, ComponentType> = {
  device: DeviceView,
  backup: BackupView,
  debloat: DebloatView,
  terminal: TerminalView,
  files: FilesView,
  logcat: LogcatView,
  performance: PerformanceView,
  wireless: WirelessView,
  settings: SettingsView,
};

function useLanguageSync() {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const language = resolveLanguage(settings.language);
  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [i18n, language]);
  useEffect(() => {
    void commands.setTrayLabels(t("tray.show"), t("tray.quit")).catch(() => {});
  }, [t, language]);
}

function useShortcuts() {
  const client = useQueryClient();
  const setModule = useAppStore((s) => s.setModule);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && /^[1-9]$/.test(event.key)) {
        const id = MODULES[Number(event.key) - 1];
        if (id) {
          event.preventDefault();
          setModule(id);
        }
      } else if (event.key === "F5") {
        event.preventDefault();
        void client.invalidateQueries();
      } else if (event.ctrlKey && event.key.toLowerCase() === "f") {
        const input = document.querySelector<HTMLInputElement>(
          "[data-module-active] [data-search]",
        );
        if (input) {
          event.preventDefault();
          input.focus();
          input.select();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [client, setModule]);
}

export function App() {
  const module = useAppStore((s) => s.module);
  // Modules stay mounted after the first visit so streams and terminal history survive switching.
  const [visited, setVisited] = useState<Set<ModuleId>>(() => new Set([module]));
  if (!visited.has(module)) setVisited(new Set(visited).add(module));
  useLanguageSync();
  useShortcuts();

  return (
    <div className="flex h-full flex-col bg-black">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <IconRail />
        <main className="tech-grid relative min-w-0 flex-1">
          {MODULES.filter((id) => visited.has(id)).map((id) => {
            const View = VIEWS[id];
            const active = id === module;
            return (
              <div
                key={id}
                hidden={!active}
                data-module-active={active ? "" : undefined}
                className="absolute inset-0 flex flex-col"
              >
                <View />
              </div>
            );
          })}
          <div className="scanlines absolute inset-0" />
        </main>
      </div>
      <ConfirmHost />
      <Toaster />
    </div>
  );
}
