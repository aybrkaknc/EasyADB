import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type DeviceEntry } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useTask } from "../../shared/hooks/useTask";
import { Button } from "../../shared/ui/Button";
import { Checkbox } from "../../shared/ui/Controls";
import { TaskBar } from "../../shared/ui/Feedback";
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
  const feedback = useFeedback();
  const task = useTask();
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

  const start = async () => {
    try {
      const outcomes = await task.run((id) =>
        commands.startPhoneJob(
          id,
          device.serial,
          chosen.filter((c): c is (typeof KINDS)[number] => c !== "system"),
          chosen.includes("system"),
        ),
      );
      const failed = outcomes.filter((o) => o.error);
      feedback.success(
        t("phone.done", { ok: outcomes.length - failed.length, failed: failed.length }),
        true,
      );
      failed.forEach((o) => feedback.failure(o.error));
      setChosen([]);
      for (const key of ["fileSets", "systemBackups", "phoneBackups"]) {
        void client.invalidateQueries({ queryKey: [key] });
      }
      // The system snapshot is a single file, so only folders can be removed from the phone.
      const arrived = outcomes.filter((o) => !o.error && !o.id.endsWith(".json"));
      setCopies(
        arrived.map((o) => ({
          id: o.id,
          name: t(`phone.kind.${o.id.split("_")[0]}`),
          bytes: null,
        })),
      );
    } catch (error) {
      feedback.failure(error, true);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
      <Panel title={t("backup.phoneData.title")}>
        <p className="mb-3 text-xs text-white/60">{t("backup.phoneData.hint")}</p>
        <div className="flex flex-col gap-2.5">
          {[...KINDS, "system" as const].map((choice) => (
            <Checkbox
              key={choice}
              checked={chosen.includes(choice)}
              onChange={() => toggle(choice)}
              disabled={!ready || task.running}
              label={t(choice === "system" ? "backup.phoneData.system" : `phone.kind.${choice}`)}
            />
          ))}
        </div>
        {!ready && !details.isLoading && (
          <p className="mt-3 text-xs text-warn/90">{t("backup.phoneData.missing")}</p>
        )}
        <Button
          className="mt-4"
          onClick={() => void start()}
          disabled={!ready || chosen.length === 0 || task.running}
        >
          {t("backup.phoneData.start", { count: chosen.length })}
        </Button>
      </Panel>
      {task.running && (
        <div className="absolute inset-x-0 bottom-0">
          <TaskBar progress={task.progress} onCancel={task.cancel} />
        </div>
      )}
      {copies.length > 0 && (
        <PhoneCopiesDialog serial={device.serial} copies={copies} onClose={() => setCopies([])} />
      )}
    </div>
  );
}
