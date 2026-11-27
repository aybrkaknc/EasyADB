import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Archive, Download, FolderOpen, RotateCcw, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type BackupSummary, commands, type DeviceEntry } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useRoot } from "../../shared/hooks/useRoot";
import { useSelection } from "../../shared/hooks/useSelection";
import { useSettings } from "../../shared/hooks/useSettings";
import { runJob } from "../../shared/jobs/store";
import { errorText, isAppError } from "../../shared/lib/errors";
import { appName, formatBytes, formatDate } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Checkbox } from "../../shared/ui/Controls";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { Badge, EmptyState, Spinner } from "../../shared/ui/Feedback";
import { restoreWarnings } from "./report";
import { FileSetsSection } from "./FileSetsSection";
import { RootStatus } from "./RootStatus";
import { RestoreDialog } from "./RestoreDialog";
import { SystemSection } from "./SystemSection";

export function ArchiveTab({ device }: { device: DeviceEntry | null }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const feedback = useFeedback();
  const confirm = useConfirm();
  const settings = useSettings();
  const selection = useSelection();
  const [restoring, setRestoring] = useState<BackupSummary | null>(null);
  const [restorePermissions, setRestorePermissions] = useState(true);
  const rootAccess = useRoot(device?.state === "device" ? device.serial : null);
  const backups = useQuery({ queryKey: ["backups"], queryFn: () => commands.listBackups() });
  const root = useQuery({ queryKey: ["backupRoot"], queryFn: () => commands.getBackupRoot() });
  const refresh = () => void client.invalidateQueries({ queryKey: ["backups"] });

  const batchItems = (backups.data ?? []).filter((b) => selection.has(b.id));

  const restoreSelected = async () => {
    if (!device || batchItems.length === 0) return;
    const serial = device.serial;
    const ok = await confirm(
      t("backup.archive.batchConfirm", { count: batchItems.length }),
      batchItems.some((b) => b.hasData),
    );
    if (!ok) return;
    await restoreAll(serial, batchItems);
    selection.clear();
  };

  const restoreAll = async (serial: string, list: BackupSummary[]) => {
    await runJob({
      kind: "restore",
      serial,
      device: device?.model ?? serial,
      items: list.map((b) => ({ key: b.package, name: appName(b) })),
      run: async ({ taskId, isCancelled, mark }) => {
        for (const backup of list) {
          if (isCancelled()) throw { code: "cancelled", detail: "" };
          mark(backup.package, "running");
          try {
            const report = await commands.startRestore(taskId, serial, backup.id, {
              restoreObb: backup.hasObb,
              restoreData: backup.hasData && rootAccess.isRoot,
              restorePermissions: restorePermissions && backup.permissionCount > 0,
              verifyHash: settings.verifyHashOnRestore,
            });
            const warnings = restoreWarnings(t, appName(backup), report);
            mark(
              backup.package,
              warnings.length ? "warning" : "done",
              warnings.join("\n") || undefined,
            );
          } catch (error) {
            if (isAppError(error) && error.code === "cancelled") throw error;
            mark(backup.package, "failed", errorText(t, error));
          }
        }
      },
      retry: (keys) =>
        void restoreAll(
          serial,
          list.filter((b) => keys.includes(b.package)),
        ),
    });
  };

  const remove = async (backup: BackupSummary) => {
    if (!(await confirm(t("backup.archive.deleteConfirm", { name: appName(backup) })))) return;
    try {
      await commands.deleteBackup(backup.id);
      refresh();
    } catch (error) {
      feedback.failure(error);
    }
  };

  const exportOne = async (backup: BackupSummary) => {
    const dest = await save({
      defaultPath: `${backup.id}.easybckp`,
      filters: [{ name: "EasyADB", extensions: ["easybckp"] }],
    });
    if (!dest) return;
    try {
      await commands.exportBackup(backup.id, dest);
      feedback.success(t("backup.archive.exported", { path: dest }), true);
    } catch (error) {
      feedback.failure(error, true);
    }
  };

  const importOne = async () => {
    const src = await open({ filters: [{ name: "EasyADB", extensions: ["easybckp"] }] });
    if (!src) return;
    try {
      await commands.importBackup(src);
      feedback.success(t("backup.archive.imported"));
      refresh();
    } catch (error) {
      feedback.failure(error);
    }
  };

  const ready = device?.state === "device";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end gap-3 px-6 py-3">
        <div className="flex shrink-0 gap-2">
          {root.data && (
            <Button variant="ghost" size="sm" onClick={() => void commands.revealPath(root.data)}>
              <FolderOpen className="size-3.5" />
              {t("common.openFolder")}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void importOne()}>
            <Upload className="size-3.5" />
            {t("backup.archive.import")}
          </Button>
          <Button
            size="sm"
            onClick={() => void restoreSelected()}
            disabled={!ready || batchItems.length === 0}
          >
            <RotateCcw className="size-3.5" />
            {t("backup.archive.restoreSelected", { count: batchItems.length })}
          </Button>
        </div>
      </div>
      {backups.data && backups.data.length > 0 && (
        <div className="flex items-center gap-3 px-6 pb-3">
          <Checkbox
            checked={backups.data.every((b) => selection.has(b.id))}
            onChange={(on) => selection.setAll(backups.data?.map((b) => b.id) ?? [], on)}
            label={t("common.selectAll")}
          />
          {selection.count > 0 && (
            <span className="text-[11px] text-white/50">
              {t("common.selected", { count: selection.count })}
            </span>
          )}
          <div className="ml-auto">
            <Checkbox
              checked={restorePermissions}
              onChange={setRestorePermissions}
              label={t("backup.archive.batchPermissions")}
            />
          </div>
        </div>
      )}
      {backups.data?.some((b) => selection.has(b.id) && b.hasData) && (
        <div className="px-6 pb-3">
          <RootStatus root={rootAccess} />
        </div>
      )}
      {backups.isLoading ? (
        <div className="p-6">
          <Spinner label={t("common.loading")} />
        </div>
      ) : !backups.data?.length ? (
        <EmptyState icon={Archive} text={t("backup.archive.empty")} />
      ) : (
        <ul className="flex-1 overflow-auto px-6 pb-6">
          {backups.data.map((backup) => (
            <li key={backup.id} className="flex items-center gap-4 border-b border-white/5 py-3">
              <Checkbox
                checked={selection.has(backup.id)}
                onChange={() => selection.toggle(backup.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs text-white">{appName(backup)}</p>
                  {backup.versionName && (
                    <span className="text-[11px] text-white/40">{backup.versionName}</span>
                  )}
                  {backup.hasData && <Badge tone="neon">{t("backup.archive.data")}</Badge>}
                  {backup.hasObb && <Badge>{t("backup.archive.obb")}</Badge>}
                </div>
                <p className="truncate text-[11px] text-white/40">
                  {backup.package} | {formatDate(backup.createdAt, i18n.language)} |{" "}
                  {formatBytes(backup.totalBytes)}
                  {backup.deviceModel && ` | ${backup.deviceModel}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" onClick={() => setRestoring(backup)} disabled={!ready}>
                  <RotateCcw className="size-3" />
                  {t("backup.archive.restore")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void exportOne(backup)}
                  aria-label={t("backup.archive.export")}
                >
                  <Download className="size-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void commands.revealPath(backup.path)}
                  aria-label={t("common.openFolder")}
                >
                  <FolderOpen className="size-3" />
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void remove(backup)}
                  aria-label={t("backup.archive.delete")}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <FileSetsSection device={device} />
      <SystemSection device={device} />
      {restoring && device && (
        <RestoreDialog
          backup={restoring}
          serial={device.serial}
          onClose={() => setRestoring(null)}
        />
      )}
    </div>
  );
}
