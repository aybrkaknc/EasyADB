import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";

import { commands, type DeviceEntry, type FileEntry } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useSelection } from "../../shared/hooks/useSelection";
import { useTask } from "../../shared/hooks/useTask";
import { cn } from "../../shared/lib/cn";
import { formatBytes, formatDate } from "../../shared/lib/format";
import { useHold } from "../../shared/jobs/store";
import { Button } from "../../shared/ui/Button";
import { Checkbox, Field, Input } from "../../shared/ui/Controls";
import { DeviceGuard } from "../../shared/ui/DeviceGuard";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { Dialog } from "../../shared/ui/Dialog";
import { EmptyState, Spinner, TaskBar } from "../../shared/ui/Feedback";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { parentPath } from "./paths";

type SortKey = "name" | "size" | "modified";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const byName = (a: FileEntry, b: FileEntry) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** Folders first, then the chosen column. Missing values go last. */
function sortFiles(files: FileEntry[], sort: Sort): FileEntry[] {
  const compare = (a: FileEntry, b: FileEntry) => {
    if (sort.key === "name") return byName(a, b);
    const x = sort.key === "size" ? a.size : a.modified;
    const y = sort.key === "size" ? b.size : b.modified;
    if (x === y) return byName(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  };
  return [...files].sort(
    (a, b) =>
      Number(b.isDir) - Number(a.isDir) || (sort.dir === "asc" ? compare(a, b) : -compare(a, b)),
  );
}

function SortButton({
  label,
  column,
  sort,
  onSort,
  right,
}: {
  label: string;
  column: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        "flex w-full items-center gap-1 whitespace-nowrap uppercase",
        right && "justify-end",
      )}
    >
      {label}
      {active &&
        (sort.dir === "asc" ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        ))}
    </button>
  );
}

function NameDialog({
  title,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const valid = name.trim() !== "" && !name.includes("/");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onSubmit(name.trim())} disabled={!valid}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <Field label={title}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valid && onSubmit(name.trim())}
          autoFocus
        />
      </Field>
    </Dialog>
  );
}

function Explorer({ device }: { device: DeviceEntry }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const feedback = useFeedback();
  const confirm = useConfirm();
  const task = useTask();
  useHold(task.running);
  const selection = useSelection();
  const [path, setPath] = useState("/sdcard");
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" });
  const onSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  const [draft, setDraft] = useState("/sdcard");
  const [dialog, setDialog] = useState<null | "mkdir" | "rename">(null);
  const key = ["files", device.serial, path];
  const files = useQuery({ queryKey: key, queryFn: () => commands.listFiles(device.serial, path) });
  const refresh = () => void client.invalidateQueries({ queryKey: key });
  const sorted = useMemo(() => sortFiles(files.data ?? [], sort), [files.data, sort]);

  const go = (next: string) => {
    selection.clear();
    setPath(next);
    setDraft(next);
  };

  const act = async (work: () => Promise<unknown>, long = false) => {
    try {
      await work();
      if (long) feedback.success(t("files.done"), true);
    } catch (error) {
      feedback.failure(error, long);
    }
    refresh();
  };

  const selectedPaths = selection.ids;
  const single =
    selectedPaths.length === 1 ? files.data?.find((f) => f.path === selectedPaths[0]) : undefined;

  const remove = async () => {
    if (!(await confirm(t("files.deleteConfirm", { count: selectedPaths.length })))) return;
    await act(() => commands.deletePaths(device.serial, selectedPaths));
    selection.clear();
  };

  const download = async () => {
    const dir = await open({ directory: true });
    if (dir)
      await act(
        () => task.run((id) => commands.pullPaths(id, device.serial, selectedPaths, dir)),
        true,
      );
  };

  const upload = async () => {
    const picked = await open({ multiple: true });
    if (picked?.length)
      await act(() => task.run((id) => commands.pushPaths(id, device.serial, picked, path)), true);
  };

  const join = (name: string) => (path === "/" ? `/${name}` : `${path}/${name}`);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => go(parentPath(path))}
          disabled={path === "/"}
          aria-label={t("files.up")}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Input
          data-search
          className="max-w-xl flex-1"
          aria-label={t("files.path")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && draft.startsWith("/") && go(draft.replace(/\/+$/, "") || "/")
          }
        />
        <Button size="sm" variant="ghost" onClick={refresh} aria-label={t("common.refresh")}>
          <RefreshCw className="size-3.5" />
        </Button>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setDialog("mkdir")}>
            <FolderPlus className="size-3" />
            {t("files.newFolder")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog("rename")} disabled={!single}>
            <Pencil className="size-3" />
            {t("files.rename")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void download()}
            disabled={!selectedPaths.length || task.running}
          >
            <Download className="size-3" />
            {t("files.download")}
          </Button>
          <Button size="sm" onClick={() => void upload()} disabled={task.running}>
            <Upload className="size-3" />
            {t("files.upload")}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void remove()}
            disabled={!selectedPaths.length}
          >
            <Trash2 className="size-3" />
            {t("common.delete")}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-[24px_1fr_100px_220px] gap-x-6 px-6 py-1.5 label">
        <span />
        <SortButton label={t("files.name")} column="name" sort={sort} onSort={onSort} />
        <SortButton label={t("files.size")} column="size" sort={sort} onSort={onSort} right />
        <SortButton label={t("files.modified")} column="modified" sort={sort} onSort={onSort} />
      </div>
      {files.isLoading ? (
        <div className="p-6">
          <Spinner label={t("common.loading")} />
        </div>
      ) : files.error ? (
        <p className="p-6 text-xs text-danger">
          {String((files.error as { detail?: string }).detail ?? files.error)}
        </p>
      ) : !files.data?.length ? (
        <EmptyState icon={FolderOpen} text={t("files.empty")} />
      ) : (
        <Virtuoso
          className="flex-1"
          data={sorted}
          computeItemKey={(_, f) => f.path}
          itemContent={(_, file: FileEntry) => (
            <div
              onClick={() => (file.isDir ? go(file.path) : selection.toggle(file.path))}
              className={cn(
                "grid cursor-pointer grid-cols-[24px_1fr_100px_220px] items-center gap-x-6 border-b border-white/5 px-6 py-1.5 text-xs hover:bg-neon/5",
                selection.has(file.path) && "bg-neon/10",
              )}
            >
              <Checkbox
                checked={selection.has(file.path)}
                onChange={() => selection.toggle(file.path)}
              />
              <span className="flex min-w-0 items-center gap-2">
                {file.isDir ? (
                  <Folder className="size-3.5 shrink-0 text-neon" />
                ) : (
                  <File className="size-3.5 shrink-0 text-white/50" />
                )}
                <span className={cn("truncate", file.isLink && "italic")}>{file.name}</span>
              </span>
              <span className="text-right text-white/60 tabular-nums">
                {file.isDir ? "" : formatBytes(file.size)}
              </span>
              <span className="text-white/50">
                {file.modified ? formatDate(file.modified, i18n.language) : ""}
              </span>
            </div>
          )}
        />
      )}
      {task.running && <TaskBar progress={task.progress} onCancel={task.cancel} />}
      {dialog === "mkdir" && (
        <NameDialog
          title={t("files.folderName")}
          initial=""
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            setDialog(null);
            void act(() => commands.makeDir(device.serial, join(name)));
          }}
        />
      )}
      {dialog === "rename" && single && (
        <NameDialog
          title={t("files.newName")}
          initial={single.name}
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            setDialog(null);
            selection.clear();
            void act(() => commands.movePath(device.serial, single.path, join(name)));
          }}
        />
      )}
    </div>
  );
}

export function FilesView() {
  const { t } = useTranslation();
  return (
    <>
      <ModuleHeader icon={FolderOpen} title={t("modules.files.title")} />
      <DeviceGuard>{(device) => <Explorer key={device.serial} device={device} />}</DeviceGuard>
    </>
  );
}
