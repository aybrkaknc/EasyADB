import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type BackupSummary, commands } from "../../bindings";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { useDevices } from "../../shared/hooks/useDevices";
import { useRoot } from "../../shared/hooks/useRoot";
import { useSettings } from "../../shared/hooks/useSettings";
import { runJob } from "../../shared/jobs/store";
import { appName } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Checkbox } from "../../shared/ui/Controls";
import { Dialog } from "../../shared/ui/Dialog";
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
  const { devices } = useDevices();
  const confirm = useConfirm();
  const [obb, setObb] = useState(backup.hasObb);
  const root = useRoot(serial);
  const [data, setData] = useState(backup.hasData);
  const dataOn = data && backup.hasData && root.isRoot;
  const [permissions, setPermissions] = useState(backup.permissionCount > 0);
  const [verify, setVerify] = useState(settings.verifyHashOnRestore);
  const name = appName(backup);

  const start = async () => {
    if (dataOn && !(await confirm(t("backup.restore.dataConfirm", { name })))) return;
    onClose();
    await runJob({
      kind: "restore",
      serial,
      device: devices.find((d) => d.serial === serial)?.model ?? serial,
      items: [{ key: backup.package, name }],
      run: ({ taskId }) =>
        commands.startRestore(taskId, serial, backup.id, {
          restoreObb: obb,
          restoreData: dataOn,
          restorePermissions: permissions,
          verifyHash: verify,
        }),
      report: (report) => {
        const warnings = restoreWarnings(t, name, report);
        return [
          {
            key: backup.package,
            state: warnings.length ? "warning" : "done",
            note: warnings.join("\n") || undefined,
          },
        ];
      },
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("backup.restore.title", { name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void start()}>{t("backup.restore.start")}</Button>
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
    </Dialog>
  );
}
