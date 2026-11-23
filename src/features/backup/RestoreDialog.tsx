import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type BackupSummary, commands } from "../../bindings";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useRoot } from "../../shared/hooks/useRoot";
import { useSettings } from "../../shared/hooks/useSettings";
import { useTask } from "../../shared/hooks/useTask";
import { appName } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Checkbox } from "../../shared/ui/Controls";
import { Dialog } from "../../shared/ui/Dialog";
import { TaskBar } from "../../shared/ui/Feedback";
import { restoreWarnings } from "./report";
import { RootStatus } from "./RootStatus";

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
  const root = useRoot(serial);
  const [data, setData] = useState(backup.hasData);
  const dataOn = data && backup.hasData && root.isRoot;
  const [permissions, setPermissions] = useState(backup.permissionCount > 0);
  const [verify, setVerify] = useState(settings.verifyHashOnRestore);
  const name = appName(backup);

  const start = async () => {
    if (dataOn && !(await confirm(t("backup.restore.dataConfirm", { name })))) return;
    try {
      const report = await task.run((id) =>
        commands.startRestore(id, serial, backup.id, {
          restoreObb: obb,
          restoreData: dataOn,
          restorePermissions: permissions,
          verifyHash: verify,
        }),
      );
      feedback.success(t("backup.restore.done", { name }), true);
      restoreWarnings(t, name, report).forEach(feedback.warning);
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
          <Button onClick={() => void start()} disabled={task.running}>
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
          checked={dataOn}
          onChange={setData}
          disabled={!backup.hasData || !root.isRoot}
          label={t("backup.restore.data")}
        />
        <Checkbox
          checked={permissions}
          onChange={setPermissions}
          disabled={backup.permissionCount === 0}
          label={t("backup.restore.permissions", { count: backup.permissionCount })}
        />
        <Checkbox checked={verify} onChange={setVerify} label={t("backup.restore.verify")} />
      </div>
      {backup.hasData && <RootStatus root={root} />}
      {task.running && (
        <div className="-mx-6">
          <TaskBar progress={task.progress} onCancel={task.cancel} />
        </div>
      )}
    </Dialog>
  );
}
