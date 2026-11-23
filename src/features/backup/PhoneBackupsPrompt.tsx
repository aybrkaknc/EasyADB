import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useTask } from "../../shared/hooks/useTask";
import { appName, formatBytes } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Dialog } from "../../shared/ui/Dialog";
import { TaskBar } from "../../shared/ui/Feedback";

const SHOWN = 5;

/** Offers to copy EasyAndroid backups found on the phone into the PC backup folder. */
export function PhoneBackupsPrompt() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const feedback = useFeedback();
  const task = useTask();
  const { selected } = useDevices();
  const serial = selected?.state === "device" ? selected.serial : null;
  const [dismissed, setDismissed] = useState<string[]>([]);
  const found = useQuery({
    queryKey: ["phoneBackups", serial],
    queryFn: () => commands.listPhoneBackups(serial!),
    enabled: serial !== null,
    staleTime: Infinity,
    retry: false,
  });
  const system = useQuery({
    queryKey: ["phoneSystem", serial],
    queryFn: () => commands.listPhoneSystem(serial!),
    enabled: serial !== null,
    staleTime: Infinity,
    retry: false,
  });
  const fresh = (found.data ?? []).filter((b) => !b.onPc);
  const files = system.data ?? [];
  if (serial === null || (fresh.length === 0 && files.length === 0) || dismissed.includes(serial)) {
    return null;
  }

  const dismiss = () => setDismissed((list) => [...list, serial]);
  const pull = async () => {
    try {
      const outcomes = await task.run((id) =>
        commands.pullPhoneBackups(
          id,
          serial,
          fresh.map((b) => b.id),
          files,
        ),
      );
      const failed = outcomes.filter((o) => o.error);
      feedback.success(
        t("phone.done", { ok: outcomes.length - failed.length, failed: failed.length }),
        true,
      );
      failed.forEach((o) => feedback.failure(o.error));
      void client.invalidateQueries({ queryKey: ["backups"] });
      void client.invalidateQueries({ queryKey: ["systemBackups"] });
      void client.invalidateQueries({ queryKey: ["phoneBackups", serial] });
      void client.invalidateQueries({ queryKey: ["phoneSystem", serial] });
    } catch (error) {
      feedback.failure(error, true);
    }
    dismiss();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !task.running && dismiss()}
      title={t("phone.title")}
      footer={
        <>
          <Button variant="ghost" onClick={dismiss} disabled={task.running}>
            {t("phone.later")}
          </Button>
          <Button onClick={() => void pull()} disabled={task.running}>
            {t("phone.pull")}
          </Button>
        </>
      }
    >
      {fresh.length > 0 && <p className="text-sm">{t("phone.body", { count: fresh.length })}</p>}
      {files.length > 0 && <p className="text-sm">{t("phone.system", { count: files.length })}</p>}
      <ul className="flex flex-col gap-1 text-white/70">
        {fresh.slice(0, SHOWN).map((b) => (
          <li key={b.id} className="truncate">
            {appName(b)} - {formatBytes(b.totalBytes)}
          </li>
        ))}
        {fresh.length > SHOWN && <li>{t("phone.more", { count: fresh.length - SHOWN })}</li>}
      </ul>
      {fresh.some((b) => b.needsRoot) && <p className="text-warn/90">{t("phone.rootWarning")}</p>}
      {task.running && (
        <div className="-mx-6">
          <TaskBar progress={task.progress} onCancel={task.cancel} />
        </div>
      )}
    </Dialog>
  );
}
