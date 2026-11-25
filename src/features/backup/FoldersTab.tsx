import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { commands, type DeviceEntry } from "../../bindings";
import { useSelection } from "../../shared/hooks/useSelection";
import { runJob } from "../../shared/jobs/store";
import { Button } from "../../shared/ui/Button";
import { Checkbox } from "../../shared/ui/Controls";
import { EmptyState, Spinner } from "../../shared/ui/Feedback";

const STORAGE = "/storage/emulated/0";
// The same folders EasyAndroid never takes: apps and the backups themselves.
const SKIPPED = ["Android", "EasyAndroid"];

/** Streams folders of the phone's shared storage straight into a backup on this PC. */
export function FoldersTab({ device, onDone }: { device: DeviceEntry; onDone: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const selection = useSelection();
  const folders = useQuery({
    queryKey: ["folders", device.serial],
    queryFn: () => commands.listFiles(device.serial, STORAGE),
  });
  const names = useMemo(
    () =>
      (folders.data ?? [])
        .filter((f) => f.isDir && !f.name.startsWith(".") && !SKIPPED.includes(f.name))
        .map((f) => f.name)
        .sort((a, b) => a.localeCompare(b)),
    [folders.data],
  );

  // All folders make one backup, so a retry takes all of them again.
  const start = async (folderNames: string[]) => {
    const id = await runJob({
      kind: "folders",
      serial: device.serial,
      device: device.model ?? device.serial,
      items: folderNames.map((name) => ({ key: name, name })),
      run: ({ taskId }) => commands.startFolderBackup(taskId, device.serial, folderNames),
      retry: () => void start(folderNames),
    });
    if (id === null) return;
    selection.clear();
    void client.invalidateQueries({ queryKey: ["fileSets"] });
    onDone();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-6 pt-3 text-[11px] text-white/50">{t("backup.folders.hint")}</p>
      <div className="flex items-center gap-4 px-6 py-3">
        <Checkbox
          checked={names.length > 0 && names.every((n) => selection.has(n))}
          onChange={(on) => selection.setAll(names, on)}
          label={t("common.selectAll")}
        />
        <span className="text-[11px] text-white/50">
          {t("common.selected", { count: selection.count })}
        </span>
        <Button
          className="ml-auto"
          size="sm"
          onClick={() => void start(selection.ids)}
          disabled={selection.count === 0}
        >
          {t("backup.folders.start", { count: selection.count })}
        </Button>
      </div>
      {folders.isLoading ? (
        <div className="p-6">
          <Spinner label={t("common.loading")} />
        </div>
      ) : names.length === 0 ? (
        <EmptyState icon={FolderTree} text={t("backup.folders.empty")} />
      ) : (
        <ul className="flex-1 overflow-auto px-6 pb-6">
          {names.map((name) => (
            <li key={name} className="flex items-center gap-3 border-b border-white/5 py-2">
              <Checkbox
                checked={selection.has(name)}
                onChange={() => selection.toggle(name)}
                label={<span className="text-xs text-white">{name}</span>}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
