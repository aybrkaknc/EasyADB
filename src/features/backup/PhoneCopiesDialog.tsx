import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useTask } from "../../shared/hooks/useTask";
import { formatBytes } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Dialog } from "../../shared/ui/Dialog";
import { TaskBar } from "../../shared/ui/Feedback";

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
  const feedback = useFeedback();
  const task = useTask();

  const remove = async () => {
    try {
      const outcomes = await task.run((id) =>
        commands.deletePhoneBackups(
          id,
          serial,
          copies.map((c) => c.id),
        ),
      );
      const failed = outcomes.filter((o) => o.error);
      feedback.success(
        t("phone.deleted", { ok: outcomes.length - failed.length, failed: failed.length }),
        true,
      );
      failed.forEach((o) => feedback.failure(o.error));
    } catch (error) {
      feedback.failure(error, true);
    }
    void client.invalidateQueries({ queryKey: ["phoneBackups", serial] });
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !task.running && onClose()}
      title={t("phone.deleteTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={task.running}>
            {t("phone.keep")}
          </Button>
          <Button variant="danger" onClick={() => void remove()} disabled={task.running}>
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
      {task.running && (
        <div className="-mx-6">
          <TaskBar progress={task.progress} onCancel={task.cancel} />
        </div>
      )}
    </Dialog>
  );
}
