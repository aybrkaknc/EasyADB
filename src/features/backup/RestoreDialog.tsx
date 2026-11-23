import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type BackupSummary, commands } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useSettings } from "../../shared/hooks/useSettings";
import { useTask } from "../../shared/hooks/useTask";
import { appName } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Checkbox, Field, Input } from "../../shared/ui/Controls";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { Dialog } from "../../shared/ui/Dialog";
import { TaskBar } from "../../shared/ui/Feedback";

export function RestoreDialog({
  backup,
  serial,
  onClose,
}: {
  backup: BackupSummary;
  serial: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const settings = useSettings();
  const feedback = useFeedback();
  const confirm = useConfirm();
  const task = useTask();
  const [obb, setObb] = useState(backup.hasObb);
  const [data, setData] = useState(false);
  const [verify, setVerify] = useState(settings.verifyHashOnRestore);
  const [password, setPassword] = useState("");
  const name = appName(backup);

  const start = async () => {
    if (data && !(await confirm(t("backup.restore.dataConfirm", { name })))) return;
    try {
      await task.run((id) =>
        commands.startRestore(id, serial, backup.id, {
          restoreObb: obb,
          restoreData: data,
          verifyHash: verify,
          password: backup.encrypted ? password : null,
        }),
      );
      feedback.success(t("backup.restore.done", { name }), true);
      onClose();
    } catch (error) {
      feedback.failure(error, true);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !task.running && onClose()}
      title={t("backup.restore.title", { name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={task.running}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => void start()}
            disabled={task.running || (backup.encrypted && !password)}
          >
            {t("backup.restore.start")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <Checkbox
          checked={obb}
          onChange={setObb}
          disabled={!backup.hasObb}
          label={t("backup.restore.obb")}
        />
        <Checkbox
          checked={data}
          onChange={setData}
          disabled={!backup.hasData}
          label={t("backup.restore.data")}
        />
        <Checkbox checked={verify} onChange={setVerify} label={t("backup.restore.verify")} />
      </div>
      {backup.encrypted && (
        <Field label={t("backup.restore.password")}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </Field>
      )}
      {task.running && (
        <div className="-mx-6">
          <TaskBar progress={task.progress} onCancel={task.cancel} />
        </div>
      )}
    </Dialog>
  );
}
