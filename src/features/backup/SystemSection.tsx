import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type DeviceEntry, type SystemSummary } from "../../bindings";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useTask } from "../../shared/hooks/useTask";
import { formatDate } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Checkbox } from "../../shared/ui/Controls";
import { Dialog } from "../../shared/ui/Dialog";
import { TaskBar } from "../../shared/ui/Feedback";

const SHOWN_FAILURES = 3;

function SystemRestoreDialog({
  snapshot,
  serial,
  onClose,
}: {
  snapshot: SystemSummary;
  serial: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const confirm = useConfirm();
  const task = useTask();
  const [settings, setSettings] = useState(snapshot.settingsCount > 0);
  const [roles, setRoles] = useState(snapshot.rolesCount > 0);
  const [wifi, setWifi] = useState(false);

  const start = async () => {
    if (!(await confirm(t("backup.system.confirm")))) return;
    try {
      const report = await task.run((id) =>
        commands.restoreSystemBackup(id, serial, snapshot.id, { settings, roles, wifi }),
      );
      feedback.success(t("backup.system.done", { count: report.applied }), true);
      if (report.failed.length > 0) {
        feedback.warning(
          t("backup.system.failed", {
            count: report.failed.length,
            items: report.failed
              .slice(0, SHOWN_FAILURES)
              .map((f) => f.item)
              .join(", "),
          }),
        );
      }
      onClose();
    } catch (error) {
      feedback.failure(error, true);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !task.running && onClose()}
      title={t("backup.system.dialogTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={task.running}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => void start()}
            disabled={task.running || !(settings || roles || wifi)}
          >
            {t("backup.system.start")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <Checkbox
          checked={settings}
          onChange={setSettings}
          disabled={snapshot.settingsCount === 0}
          label={t("backup.system.settings", { count: snapshot.settingsCount })}
        />
        <Checkbox
          checked={roles}
          onChange={setRoles}
          disabled={snapshot.rolesCount === 0}
          label={t("backup.system.roles", { count: snapshot.rolesCount })}
        />
        <Checkbox
          checked={wifi}
          onChange={setWifi}
          disabled={snapshot.wifiCount === 0}
          label={t("backup.system.wifi", { count: snapshot.wifiCount })}
        />
      </div>
      <p className="text-white/60">{t("backup.system.note")}</p>
      {wifi && <p className="text-warn/90">{t("backup.system.wifiHint")}</p>}
      {task.running && (
        <div className="-mx-6">
          <TaskBar progress={task.progress} onCancel={task.cancel} />
        </div>
      )}
    </Dialog>
  );
}

/** System snapshots made by EasyAndroid (settings, default apps, Wi-Fi), listed under the backups. */
export function SystemSection({ device }: { device: DeviceEntry | null }) {
  const { t, i18n } = useTranslation();
  const snapshots = useQuery({
    queryKey: ["systemBackups"],
    queryFn: () => commands.listSystemBackups(),
  });
  const [restoring, setRestoring] = useState<SystemSummary | null>(null);
  if (!snapshots.data?.length) return null;
  const ready = device?.state === "device";
  return (
    <section className="border-t border-line px-6 py-3">
      <p className="label mb-2">{t("backup.system.title")}</p>
      <ul className="flex max-h-40 flex-col overflow-auto">
        {snapshots.data.map((snapshot) => (
          <li key={snapshot.id} className="flex items-center gap-4 border-b border-white/5 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-white">
                {formatDate(snapshot.createdAt, i18n.language)}
                {snapshot.deviceModel && ` | ${snapshot.deviceModel}`}
              </p>
              <p className="truncate text-[10px] text-white/40">
                {t("backup.system.summary", {
                  settings: snapshot.settingsCount,
                  roles: snapshot.rolesCount,
                  wifi: snapshot.wifiCount,
                })}
              </p>
            </div>
            <Button size="sm" onClick={() => setRestoring(snapshot)} disabled={!ready}>
              <RotateCcw className="size-3" />
              {t("backup.system.restore")}
            </Button>
          </li>
        ))}
      </ul>
      {restoring && device && (
        <SystemRestoreDialog
          snapshot={restoring}
          serial={device.serial}
          onClose={() => setRestoring(null)}
        />
      )}
    </section>
  );
}
