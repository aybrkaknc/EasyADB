import { useQueryClient } from "@tanstack/react-query";
import { type ComponentType, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { commands } from "../bindings";
import { BackupView } from "../features/backup/BackupView";
import { PhoneBackupsPrompt } from "../features/backup/PhoneBackupsPrompt";
import { TrustNewPhone } from "../features/backup/TrustNewPhone";
import { DebloatView } from "../features/debloat/DebloatView";
import { DebuggingView } from "../features/debugging/DebuggingView";
import { DeviceView } from "../features/device/DeviceView";
import { FilesView } from "../features/files/FilesView";
import { SettingsView } from "../features/settings/SettingsView";
import { TerminalView } from "../features/terminal/TerminalView";
import { useConnections } from "../shared/hooks/useConnections";
import { useSettings } from "../shared/hooks/useSettings";
import { JobHost } from "../shared/jobs/JobHost";
import { ConfirmHost } from "../shared/ui/Dialog";
import { Toaster } from "../shared/ui/Feedback";
import { resolveLanguage } from "./i18n";
import { IconRail } from "./shell/IconRail";
import { TitleBar } from "./shell/TitleBar";
import { MODULES, type ModuleId, useAppStore } from "./store";

const VIEWS: Record<ModuleId, ComponentType> = {
  device: DeviceView,
  debugging: DebuggingView,
  backup: BackupView,
  debloat: DebloatView,
  terminal: TerminalView,
  files: FilesView,
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
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F5") {
        event.preventDefault();
        // Root checks make the phone show a prompt, so a refresh keeps their cached result.
        void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "root" });
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
  }, [client]);
}

export function App() {
  const module = useAppStore((s) => s.module);
  // Modules stay mounted after the first visit so streams and terminal history survive switching.
  const [visited, setVisited] = useState<Set<ModuleId>>(() => new Set([module]));
  if (!visited.has(module)) setVisited(new Set(visited).add(module));
  useLanguageSync();
  useShortcuts();
  useConnections();

  return (
    <div className="flex h-full flex-col bg-black">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <IconRail />
        <main className="tech-dots relative isolate min-w-0 flex-1">
          <div className="absolute inset-0 -z-10 bg-black/70" />
          {MODULES.filter((id) => visited.has(id)).map((id) => {
            const View = VIEWS[id];
            const active = id === module;
            return (
              <div
                key={id}
                data-module-active={active ? "" : undefined}
                // `flex` would override the `hidden` attribute, so hidden modules keep showing
                // and stack on top of each other. Hide them with the class instead.
                className={active ? "absolute inset-0 flex flex-col" : "hidden"}
              >
                <View />
              </div>
            );
          })}
          <div className="scanlines absolute inset-0" />
        </main>
      </div>
      <ConfirmHost />
      <PhoneBackupsPrompt />
      <TrustNewPhone />
      <JobHost />
      <Toaster />
    </div>
  );
}
