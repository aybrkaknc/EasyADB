import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { commands, type DeviceEntry } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useTask } from "../../shared/hooks/useTask";
import { formatBytes, formatDate } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { TaskBar } from "../../shared/ui/Feedback";

/**
 * Messages, call logs, folders and wallpapers on this PC. EasyADB cannot restore them; it
 * sends them back to the phone's backup folder, where EasyAndroid restores them.
 */
export function FileSetsSection({ device }: { device: DeviceEntry | null }) {
  const { t, i18n } = useTranslation();
  const feedback = useFeedback();
  const task = useTask();
  const sets = useQuery({ queryKey: ["fileSets"], queryFn: () => commands.listFileSets() });
  if (!sets.data?.length) return null;
  const serial = device?.state === "device" ? device.serial : null;

  const send = async (id: string) => {
    if (!serial) return;
    try {
      await task.run((taskId) => commands.pushBackupToPhone(taskId, serial, id));
      feedback.success(t("backup.fileSets.sent"), true);
    } catch (error) {
      feedback.failure(error, true);
    }
  };

  return (
    <section className="border-t border-line px-6 py-3">
      <p className="label mb-2">{t("backup.fileSets.title")}</p>
      <ul className="flex max-h-40 flex-col overflow-auto">
        {sets.data.map((set) => (
          <li key={set.id} className="flex items-center gap-4 border-b border-white/5 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-white">{t(`phone.kind.${set.kind}`)}</p>
              <p className="truncate text-[10px] text-white/40">
                {formatDate(set.createdAt, i18n.language)} | {formatBytes(set.totalBytes)}
                {set.deviceModel && ` | ${set.deviceModel}`}
              </p>
            </div>
            <Button size="sm" onClick={() => void send(set.id)} disabled={!serial || task.running}>
              <Upload className="size-3" />
              {t("backup.fileSets.send")}
            </Button>
          </li>
        ))}
      </ul>
      {task.running && (
        <div className="-mx-6 mt-2">
          <TaskBar progress={task.progress} onCancel={task.cancel} />
        </div>
      )}
    </section>
  );
}
