import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Settings as SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { type Settings, useSaveSettings, useSettings } from "../../shared/hooks/useSettings";
import { Button } from "../../shared/ui/Button";
import { FilterChips, Switch } from "../../shared/ui/Controls";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { Panel } from "../../shared/ui/Panel";

type Toggle =
  | "notifications"
  | "sound"
  | "confirmDestructive"
  | "fileLogging"
  | "verifyHashOnRestore"
  | "closeToTray";

const TOGGLES: [Toggle, string][] = [
  ["notifications", "settings.notifications"],
  ["sound", "settings.sound"],
  ["confirmDestructive", "settings.confirm"],
  ["verifyHashOnRestore", "settings.verifyHash"],
  ["closeToTray", "settings.closeToTray"],
  ["fileLogging", "settings.fileLogging"],
];

export function SettingsView() {
  const { t } = useTranslation();
  const settings = useSettings();
  const save = useSaveSettings();
  const feedback = useFeedback();
  const backupRoot = useQuery({
    queryKey: ["backupRoot", settings.backupDir],
    queryFn: () => commands.getBackupRoot(),
  });
  const version = useQuery({ queryKey: ["version"], queryFn: getVersion, staleTime: Infinity });

  const update = (patch: Partial<Settings>) => {
    save.mutate({ ...settings, ...patch }, { onError: (error) => feedback.failure(error) });
  };

  const chooseBackupDir = async () => {
    const dir = await open({ directory: true });
    if (dir) update({ backupDir: dir });
  };

  return (
    <>
      <ModuleHeader
        icon={SettingsIcon}
        title={t("modules.settings.title")}
        subtitle={t("modules.settings.subtitle")}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-auto p-6 xl:grid-cols-2">
        <Panel title={t("settings.language")}>
          <FilterChips
            value={settings.language ?? "system"}
            options={[
              { value: "system", label: t("settings.system") },
              { value: "en", label: "English" },
              { value: "tr", label: "Türkçe" },
            ]}
            onChange={(value) => update({ language: value === "system" ? null : value })}
          />
        </Panel>

        <Panel title={t("settings.backupDir")}>
          <p className="mb-3 truncate text-xs text-white/80" title={backupRoot.data}>
            {backupRoot.data ?? "-"}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void chooseBackupDir()}>
              {t("settings.change")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => update({ backupDir: null })}
              disabled={!settings.backupDir}
            >
              {t("settings.reset")}
            </Button>
            {backupRoot.data && (
              <Button variant="ghost" onClick={() => void commands.revealPath(backupRoot.data)}>
                <FolderOpen className="size-3.5" />
                {t("common.openFolder")}
              </Button>
            )}
          </div>
        </Panel>

        <Panel title={t("modules.settings.title")} className="xl:col-span-2">
          <div className="flex flex-col divide-y divide-white/5">
            {TOGGLES.map(([key, label]) => (
              <Switch
                key={key}
                checked={settings[key]}
                onChange={(value) => update({ [key]: value })}
                label={t(label)}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => void commands.openLogDir().catch(feedback.failure)}
          >
            {t("settings.openLogs")}
          </Button>
        </Panel>

        <Panel title={t("settings.shortcuts.title")}>
          <ul className="flex flex-col gap-1.5 text-xs text-white/80">
            <li>{t("settings.shortcuts.modules")}</li>
            <li>{t("settings.shortcuts.refresh")}</li>
            <li>{t("settings.shortcuts.search")}</li>
          </ul>
        </Panel>

        <Panel title={t("settings.about.title")}>
          <div className="flex flex-col gap-1.5 text-xs text-white/80">
            <p className="text-neon">
              {t("settings.about.version", { version: version.data ?? "-" })}
            </p>
            <p>{t("settings.about.license")}</p>
            <p>{t("settings.about.credits")}</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
