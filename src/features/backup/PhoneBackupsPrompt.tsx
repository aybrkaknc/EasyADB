import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type PhoneBackup } from "../../bindings";
import { reportOutcomes, runJob, useIdle, useJobs } from "../../shared/jobs/store";
import { appName, formatBytes } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Dialog } from "../../shared/ui/Dialog";
import { PhoneCopiesDialog } from "./PhoneCopiesDialog";
import { usePhoneDialog, usePhoneFindings } from "./phoneNotice";

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
  const { selected, serial, fresh, files } = usePhoneFindings();
  const open = usePhoneDialog((s) => s.open);
  const setOpen = usePhoneDialog((s) => s.setOpen);
  const dismissed = usePhoneDialog((s) => s.dismissed);
  // Backups that now exist on the PC too, offered for removal from the phone.
  const [copied, setCopied] = useState<PhoneBackup[]>([]);
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

  if (
    !open ||
    serial === null ||
    dismissed.includes(serial) ||
    (fresh.length === 0 && files.length === 0)
  ) {
    return null;
  }

  const dismiss = () => setOpen(false);
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
      onOpenChange={(next) => !next && dismiss()}
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
