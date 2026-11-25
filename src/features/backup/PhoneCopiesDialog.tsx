import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";
import { reportOutcomes, runJob } from "../../shared/jobs/store";
import { formatBytes } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Dialog } from "../../shared/ui/Dialog";

const SHOWN = 5;

export interface PhoneCopy {
  id: string;
  name: string;
  bytes: number | null;
}

/**
 * Asks whether to delete the copies that stay on the phone after a backup reached this PC. Always
 * asked, whatever the setting for irreversible actions says, and the delete step checks the PC
 * copy again before it removes anything.
 */
export function PhoneCopiesDialog({
  serial,
  copies,
  onClose,
}: {
  serial: string;
  copies: PhoneCopy[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { devices } = useDevices();

  const remove = async () => {
    onClose();
    const ids = copies.map((c) => c.id);
    await runJob({
      kind: "deleteCopies",
      serial,
      device: devices.find((d) => d.serial === serial)?.model ?? serial,
      items: copies.map((c) => ({ key: c.id, name: c.name })),
      run: ({ taskId }) => commands.deletePhoneBackups(taskId, serial, ids),
      report: (list) => reportOutcomes(list, (id) => copies.find((c) => c.id === id)?.name ?? id),
    });
    void client.invalidateQueries({ queryKey: ["phoneBackups", serial] });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("phone.deleteTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("phone.keep")}
          </Button>
          <Button variant="danger" onClick={() => void remove()}>
            {t("phone.delete")}
          </Button>
        </>
      }
    >
      <p className="text-sm">{t("phone.deleteBody", { count: copies.length })}</p>
      <ul className="flex flex-col gap-1 text-white/70">
        {copies.slice(0, SHOWN).map((c) => (
          <li key={c.id} className="truncate">
            {c.name} - {formatBytes(c.bytes)}
          </li>
        ))}
        {copies.length > SHOWN && <li>{t("phone.more", { count: copies.length - SHOWN })}</li>}
      </ul>
    </Dialog>
  );
}
