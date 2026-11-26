import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { type Settings, useSaveSettings, useSettings } from "../../shared/hooks/useSettings";
import { Button } from "../../shared/ui/Button";
import { FilterChips, Switch } from "../../shared/ui/Controls";
import { Panel } from "../../shared/ui/Panel";
import { SubHeading } from "../../shared/ui/SubHeading";
import { SpeedTest } from "./SpeedTest";

type Toggle = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

function useUpdate() {
  const settings = useSettings();
  const save = useSaveSettings();
  const feedback = useFeedback();
  const update = (patch: Partial<Settings>) => {
    save.mutate({ ...settings, ...patch }, { onError: (error) => feedback.failure(error) });
  };
  return { settings, update };
}

function Toggles({ toggles }: { toggles: [Toggle, string][] }) {
  const { t } = useTranslation();
  const { settings, update } = useUpdate();
  return (
    <div className="flex flex-col divide-y divide-white/5">
      {toggles.map(([key, label]) => (
        <Switch
          key={key}
          checked={settings[key]}
          onChange={(value) => update({ [key]: value })}
          label={t(label)}
        />
      ))}
    </div>
  );
}

export function AppSection() {
  const { t } = useTranslation();
  const { settings, update } = useUpdate();
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 text-xs">
        <span>{t("settings.language")}</span>
        <FilterChips
          value={settings.language ?? "system"}
          options={[
            { value: "system", label: t("settings.system") },
            { value: "en", label: "English" },
            { value: "tr", label: "Türkçe" },
          ]}
          onChange={(value) => update({ language: value === "system" ? null : value })}
        />
      </div>
      <Toggles
        toggles={[
          ["closeToTray", "settings.closeToTray"],
          ["notifications", "settings.notifications"],
          ["sound", "settings.sound"],
          ["confirmDestructive", "settings.confirm"],
        ]}
      />
    </Panel>
  );
}

export function BackupSection() {
  const { t } = useTranslation();
  const { settings, update } = useUpdate();
  const backupRoot = useQuery({
    queryKey: ["backupRoot", settings.backupDir],
    queryFn: () => commands.getBackupRoot(),
  });
  const chooseBackupDir = async () => {
    const dir = await open({ directory: true });
    if (dir) update({ backupDir: dir });
  };
  return (
    <Panel>
      <SubHeading>{t("settings.backupDir")}</SubHeading>
      <p className="mb-3 truncate text-xs text-white/80" title={backupRoot.data}>
        {backupRoot.data ?? "-"}
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
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
      <Toggles toggles={[["verifyHashOnRestore", "settings.verifyHash"]]} />
    </Panel>
  );
}

function PhoneList({
  phones,
  name,
  action,
  onAction,
}: {
  phones: string[];
  name: (serial: string) => string;
  action: string;
  onAction: (serial: string) => void;
}) {
  return (
    <ul className="flex flex-col divide-y divide-white/5 text-xs">
      {phones.map((serial) => (
        <li key={serial} className="flex items-center justify-between gap-3 py-1.5">
          <span className="truncate font-mono text-white/80">{name(serial)}</span>
          <Button variant="ghost" size="sm" onClick={() => onAction(serial)}>
            {action}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function PhonesSection() {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const client = useQueryClient();
  const { devices } = useDevices();
  const known = useQuery({ queryKey: ["discovery"], queryFn: () => commands.wirelessDiscover() });
  const trusted = useQuery({
    queryKey: ["trustedPhones"],
    queryFn: () => commands.listTrustedPhones(),
  });
  const never = useQuery({
    queryKey: ["neverAskPhones"],
    queryFn: () => commands.listNeverAskPhones(),
  });
  /** The model of a phone seen now or remembered, next to its serial. */
  const name = (serial: string) => {
    const model =
      devices.find((d) => d.phone === serial && d.model)?.model ??
      known.data?.phones.find((p) => p.key === serial)?.model;
    return model ? `${model} · ${serial}` : serial;
  };
  const askAgain = (phone: string) => {
    void commands
      .neverAskPhone(phone, false)
      .then(() => client.invalidateQueries({ queryKey: ["neverAskPhones"] }))
      .catch(feedback.failure);
  };
  const forget = (phone: string) => {
    void commands
      .forgetTrustedPhone(phone)
      .then(() => client.invalidateQueries({ queryKey: ["trustedPhones"] }))
      .catch(feedback.failure);
  };
  return (
    <Panel>
      <SubHeading>{t("settings.trusted.title")}</SubHeading>
      {trusted.data?.length ? (
        <PhoneList
          phones={trusted.data}
          name={name}
          action={t("settings.trusted.forget")}
          onAction={forget}
        />
      ) : (
        <p className="text-xs text-white/50">{t("settings.trusted.empty")}</p>
      )}
      <p className="mt-3 text-[11px] text-white/40">{t("settings.trusted.hint")}</p>
      {never.data && never.data.length > 0 && (
        <>
          <div className="mt-4">
            <SubHeading>{t("settings.trusted.neverTitle")}</SubHeading>
          </div>
          <PhoneList
            phones={never.data}
            name={name}
            action={t("settings.trusted.askAgain")}
            onAction={askAgain}
          />
        </>
      )}
    </Panel>
  );
}

export function ConnectionSection() {
  return (
    <Panel>
      <Toggles toggles={[["autoConnect", "settings.autoConnect"]]} />
      <div className="mt-3 border-t border-white/5 pt-3">
        <SpeedTest />
      </div>
    </Panel>
  );
}

export function DiagnosticsSection() {
  const { t } = useTranslation();
  const feedback = useFeedback();
  return (
    <Panel>
      <Toggles toggles={[["fileLogging", "settings.fileLogging"]]} />
      <Button
        variant="ghost"
        className="mt-3"
        onClick={() => void commands.openLogDir().catch(feedback.failure)}
      >
        {t("settings.openLogs")}
      </Button>
    </Panel>
  );
}

export function AboutSection() {
  const { t } = useTranslation();
  const version = useQuery({ queryKey: ["version"], queryFn: getVersion, staleTime: Infinity });
  return (
    <Panel>
      <div className="flex flex-col gap-1.5 text-xs text-white/80">
        <p className="text-neon">{t("settings.about.version", { version: version.data ?? "-" })}</p>
        <p>{t("settings.about.license")}</p>
        <p>{t("settings.about.credits")}</p>
      </div>
    </Panel>
  );
}
