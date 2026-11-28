import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type DeviceEntry } from "../../bindings";
import { reportOutcomes, runJob, useIdle } from "../../shared/jobs/store";
import { Button } from "../../shared/ui/Button";
import { Checkbox } from "../../shared/ui/Controls";
import { Panel } from "../../shared/ui/Panel";
import { PhoneCopiesDialog, type PhoneCopy } from "./PhoneCopiesDialog";

const KINDS = ["messages", "calls", "wallpaper"] as const;
type Choice = (typeof KINDS)[number] | "system";

/**
 * Backups that only the phone can make, because they need EasyAndroid's root access: messages,
 * call logs, wallpapers and system settings. The phone makes them and this PC copies them.
 */
export function PhoneDataTab({ device }: { device: DeviceEntry }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const idle = useIdle();
  const [chosen, setChosen] = useState<Choice[]>([]);
  const [copies, setCopies] = useState<PhoneCopy[]>([]);
  const details = useQuery({
    queryKey: ["deviceDetails", device.serial],
    queryFn: () => commands.getDeviceDetails(device.serial),
    retry: false,
  });
  const ready = details.data?.easyAndroid === true;

  const toggle = (choice: Choice) =>
    setChosen((list) =>
      list.includes(choice) ? list.filter((c) => c !== choice) : [...list, choice],
    );

  const label = (choice: string) =>
    t(choice === "system" ? "backup.phoneData.system" : `phone.kind.${choice}`);

  // The phone names the backups it makes, so the choice an outcome belongs to is in its id.
  const start = async (choices: Choice[]) => {
    const outcomes = await runJob({
      kind: "phoneData",
      serial: device.serial,
      device: device.model ?? device.serial,
      items: choices.map((c) => ({ key: c, name: label(c) })),
      run: ({ taskId }) =>
        commands.startPhoneJob(
          taskId,
          device.serial,
          choices.filter((c): c is (typeof KINDS)[number] => c !== "system"),
          choices.includes("system"),
        ),
      report: (list) =>
        reportOutcomes(list).map((r) => ({ ...r, key: r.key.split("_")[0] ?? r.key })),
      retry: (keys) => void start(choices.filter((c) => keys.includes(c))),
    });
    if (!outcomes) return;
    setChosen([]);
    for (const key of ["fileSets", "systemBackups", "phoneBackups"]) {
      void client.invalidateQueries({ queryKey: [key] });
    }
    // The system snapshot is a single file, so only folders can be removed from the phone.
    const arrived = outcomes.filter((o) => !o.error && !o.id.endsWith(".json"));
    setCopies(
      arrived.map((o) => ({ id: o.id, name: label(o.id.split("_")[0] ?? o.id), bytes: null })),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel title={t("backup.phoneData.title")}>
        <p className="mb-3 text-xs text-white/60">{t("backup.phoneData.hint")}</p>
        <div className="flex flex-col gap-2.5">
          {[...KINDS, "system" as const].map((choice) => (
            <Checkbox
              key={choice}
              checked={chosen.includes(choice)}
              onChange={() => toggle(choice)}
              disabled={!ready}
              label={label(choice)}
            />
          ))}
        </div>
        {!ready && !details.isLoading && (
          <p className="mt-3 text-xs text-warn/90">{t("backup.phoneData.missing")}</p>
        )}
        <Button
          className="mt-4"
          onClick={() => void start(chosen)}
          disabled={!ready || chosen.length === 0}
        >
          {t("backup.phoneData.start", { count: chosen.length })}
        </Button>
      </Panel>
      {copies.length > 0 && idle && (
        <PhoneCopiesDialog serial={device.serial} copies={copies} onClose={() => setCopies([])} />
      )}
    </div>
  );
}
