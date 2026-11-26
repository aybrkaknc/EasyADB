import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type DeviceEntry, type SystemSummary } from "../../bindings";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { useDevices } from "../../shared/hooks/useDevices";
import { runJob } from "../../shared/jobs/store";
import { errorText } from "../../shared/lib/errors";
import { formatDate } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Checkbox } from "../../shared/ui/Controls";
import { Dialog } from "../../shared/ui/Dialog";

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
  const { devices } = useDevices();
  const confirm = useConfirm();
  const [settings, setSettings] = useState(snapshot.settingsCount > 0);
  const [roles, setRoles] = useState(snapshot.rolesCount > 0);
  const [wifi, setWifi] = useState(false);

  const start = async () => {
    if (!(await confirm(t("backup.system.confirm")))) return;
    onClose();
    await runJob({
      kind: "systemRestore",
      serial,
      device: devices.find((d) => d.serial === serial)?.model ?? serial,
      items: [],
      run: ({ taskId }) =>
        commands.restoreSystemBackup(taskId, serial, snapshot.id, { settings, roles, wifi }),
      report: (report) => [
        {
          key: "applied",
          name: t("backup.system.done", { count: report.applied }),
          state: "done",
        },
        ...report.failed.map((f) => ({
          key: f.item,
          name: f.item,
          state: "warning" as const,
          note: errorText(t, f.error),
        })),
      ],
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("backup.system.dialogTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void start()} disabled={!(settings || roles || wifi)}>
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
              <p className="truncate text-[11px] text-white/40">
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
