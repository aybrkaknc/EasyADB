import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type PhoneBackup } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";
import { reportOutcomes, runJob, useIdle, useJobs } from "../../shared/jobs/store";
import { appName, formatBytes } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Dialog } from "../../shared/ui/Dialog";
import { PhoneCopiesDialog } from "./PhoneCopiesDialog";

const SHOWN = 5;

/** What a found backup is called: the app, or the kind of file backup. */
function backupName(t: (key: string) => string, b: PhoneBackup) {
  return b.fileKind ? t(`phone.kind.${b.fileKind}`) : appName(b);
}

/** Offers to copy EasyAndroid backups found on the phone into the PC backup folder. */
export function PhoneBackupsPrompt() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const idle = useIdle();
  const trustOpen = useJobs((s) => s.trustOpen);
  const { selected } = useDevices();
  const serial = selected?.state === "device" ? selected.serial : null;
  const [dismissed, setDismissed] = useState<string[]>([]);
  // Backups that now exist on the PC too, offered for removal from the phone.
  const [copied, setCopied] = useState<PhoneBackup[]>([]);
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
  // One window at a time: jobs and the question about trust come first.
  if (!idle || trustOpen) return null;
  if (copied.length > 0 && serial !== null) {
    return (
      <PhoneCopiesDialog
        serial={serial}
        copies={copied.map((b) => ({
          id: b.id,
          name: backupName(t, b),
          bytes: b.totalBytes,
        }))}
        onClose={() => setCopied([])}
      />
    );
  }

  if (serial === null || (fresh.length === 0 && files.length === 0) || dismissed.includes(serial)) {
    return null;
  }

  const dismiss = () => setDismissed((list) => [...list, serial]);
  const pull = async (ids: string[], snapshots: string[]) => {
    dismiss();
    const name = (id: string) => {
      const backup = fresh.find((b) => b.id === id);
      return backup ? backupName(t, backup) : id;
    };
    const outcomes = await runJob({
      kind: "pull",
      serial,
      device: selected?.model ?? serial,
      items: [...ids, ...snapshots].map((id) => ({ key: id, name: name(id) })),
      run: ({ taskId }) => commands.pullPhoneBackups(taskId, serial, ids, snapshots),
      report: (list) => reportOutcomes(list, name),
      retry: (keys) =>
        void pull(
          ids.filter((id) => keys.includes(id)),
          snapshots.filter((id) => keys.includes(id)),
        ),
    });
    // Only what arrived whole is offered for removal; the delete step checks it once more.
    const arrived = new Set(outcomes?.filter((o) => !o.error).map((o) => o.id));
    setCopied(fresh.filter((b) => arrived.has(b.id)));
    for (const key of ["backups", "fileSets", "systemBackups", "phoneBackups", "phoneSystem"]) {
      void client.invalidateQueries({ queryKey: [key] });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && dismiss()}
      title={t("phone.title")}
      footer={
        <>
          <Button variant="ghost" onClick={dismiss}>
            {t("phone.later")}
          </Button>
          <Button
            onClick={() =>
              void pull(
                fresh.map((b) => b.id),
                files,
              )
            }
          >
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
            {backupName(t, b)} - {formatBytes(b.totalBytes)}
          </li>
        ))}
        {fresh.length > SHOWN && <li>{t("phone.more", { count: fresh.length - SHOWN })}</li>}
      </ul>
      {fresh.some((b) => b.needsRoot) && <p className="text-warn/90">{t("phone.rootWarning")}</p>}
    </Dialog>
  );
}
