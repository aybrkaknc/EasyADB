import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  ArrowUp,
  Copy,
  Database,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { ContextMenu } from "radix-ui";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";

import { commands, type DeviceEntry, type FileEntry, type TransferReport } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useSelection } from "../../shared/hooks/useSelection";
import { useTask } from "../../shared/hooks/useTask";
import { cn } from "../../shared/lib/cn";
import { errorText, isAppError } from "../../shared/lib/errors";
import { clock, formatBytes, formatDate } from "../../shared/lib/format";
import { useHold } from "../../shared/jobs/store";
import { Button } from "../../shared/ui/Button";
import { Checkbox, Input } from "../../shared/ui/Controls";
import { DeviceGuard } from "../../shared/ui/DeviceGuard";
import { useConfirm, useConfirmStore } from "../../shared/hooks/useConfirm";
import { EmptyState, Spinner, TaskBar } from "../../shared/ui/Feedback";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { NameDialog } from "./NameDialog";
import { localName, parentPath } from "./paths";
import { FolderPicker, UploadPicker } from "./PickDialog";
import { matches, nextSort, type Sort, type SortKey, sortFiles } from "./sort";
import { SortButton } from "./SortButton";

const ICON_BY_EXTENSION: Record<string, LucideIcon> = {
  apk: FileArchive,
  zip: FileArchive,
  rar: FileArchive,
  "7z": FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  jpg: FileImage,
  jpeg: FileImage,
  png: FileImage,
  gif: FileImage,
  webp: FileImage,
  heic: FileImage,
  bmp: FileImage,
  mp4: FileVideo,
  mkv: FileVideo,
  mov: FileVideo,
  webm: FileVideo,
  avi: FileVideo,
  mp3: FileAudio,
  m4a: FileAudio,
  flac: FileAudio,
  ogg: FileAudio,
  wav: FileAudio,
  pdf: FileText,
  txt: FileText,
  md: FileText,
  doc: FileText,
  docx: FileText,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  json: FileJson,
  xml: FileCode,
  js: FileCode,
  ts: FileCode,
  kt: FileCode,
  db: Database,
  sqlite: Database,
};

/** A file icon by its extension; unknown or missing extensions keep the plain file icon. */
function FileIcon({ name }: { name: string }) {
  const dot = name.lastIndexOf(".");
  const Icon = (dot > 0 && ICON_BY_EXTENSION[name.slice(dot + 1).toLowerCase()]) || File;
  return <Icon className="size-3.5 shrink-0 text-white/50" aria-hidden />;
}

interface MenuEntry {
  icon: typeof Copy;
  label: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** Opens a menu with a right click on what it wraps. */
function Menu({ entries, children }: { entries: () => MenuEntry[]; children: ReactNode }) {
  const [shown, setShown] = useState<MenuEntry[]>([]);
  return (
    <ContextMenu.Root onOpenChange={(open) => open && setShown(entries())}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-48 border border-neon/40 bg-panel p-1 text-xs shadow-xl">
          {shown.map((entry) => (
            <ContextMenu.Item
              key={entry.label}
              disabled={entry.disabled}
              onSelect={entry.run}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-neon/10",
                entry.danger && "text-danger",
              )}
            >
              <entry.icon className="size-3.5" />
              {entry.label}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
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
  const onSort = (key: SortKey) => setSort((s) => nextSort(s, key));
  const [draft, setDraft] = useState("/sdcard");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "mkdir" | "upload">(null);
  const [renaming, setRenaming] = useState<FileEntry | null>(null);
  /** The entries that wait for a PC folder to be downloaded to. */
  const [downloading, setDownloading] = useState<FileEntry[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const key = ["files", device.serial, path];
  const files = useQuery({ queryKey: key, queryFn: () => commands.listFiles(device.serial, path) });
  // Each click turns the button once and flashes the list, even when nothing has changed.
  const [refreshes, setRefreshes] = useState(0);
  const refresh = () => {
    setRefreshes((n) => n + 1);
    void client.invalidateQueries({ queryKey: key });
  };
  const sorted = useMemo(
    () =>
      sortFiles(
        (files.data ?? []).filter((f) => matches(f.name, search)),
        sort,
      ),
    [files.data, search, sort],
  );

  const go = (next: string) => {
    selection.clear();
    setSearch("");
    setPath(next);
    setDraft(next);
  };

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      feedback.failure(error);
    }
    refresh();
  };

  // What the search hides is left alone: nobody deletes what they cannot see.
  const selected = sorted.filter((f) => selection.has(f.path));
  const single = selected.length === 1 ? selected[0] : undefined;

  const remove = async (entries: FileEntry[]) => {
    if (!(await confirm(t("files.deleteConfirm", { count: entries.length })))) return;
    await act(() =>
      commands.deletePaths(
        device.serial,
        entries.map((f) => f.path),
      ),
    );
    selection.clear();
  };

  /** Asks before names that are already at the destination are written over. */
  const mayOverwrite = async (names: string[], there: { name: string; isDir: boolean }[]) => {
    const clash = there.filter((entry) => names.includes(entry.name));
    if (!clash.length) return true;
    const listed = clash.slice(0, 5).map((entry) => entry.name);
    if (clash.length > listed.length) listed.push("...");
    const key = clash.some((entry) => entry.isDir) ? "files.overwriteFolders" : "files.overwrite";
    return confirm(t(key, { names: listed.join(", ") }), true, true);
  };

  /** Runs a copy and says how it ended, with what arrived when it was cut off. */
  const transfer = async (
    work: (id: string) => Promise<TransferReport>,
    action?: { label: string; run: () => void },
  ) => {
    const started = Date.now();
    try {
      const report = await task.run(work);
      const { done, total, error, partial } = report;
      if (!error) {
        const size = formatBytes(report.bytes);
        const time = clock((Date.now() - started) / 1000);
        feedback.success(t("files.transferred", { count: done, size, time }), true, action);
      } else {
        const cancelled = error.code === "cancelled";
        const lines = [
          t(cancelled ? "files.transferCancelled" : "files.transferFailed", { done, total }),
        ];
        if (cancelled && error.detail === "phone") lines.push(t("files.cancelledOnPhone"));
        if (!cancelled) lines.push(errorText(t, error));
        if (partial) lines.push(t("files.partial", { path: partial }));
        if (cancelled) feedback.warning(lines.join("\n"));
        else feedback.failure(lines.join("\n"), true);
      }
    } catch (error) {
      if (isAppError(error) && (error.code === "no_space" || error.code === "phone_no_space")) {
        const [needed, free] = error.detail.split("/").map(Number);
        const key = error.code === "no_space" ? "files.noSpacePc" : "files.noSpacePhone";
        feedback.failure(t(key, { needed: formatBytes(needed), free: formatBytes(free) }), true);
      } else {
        feedback.failure(error, true);
      }
    }
    refresh();
  };

  const cancel = async () => {
    if (await confirm(t("files.cancelConfirm"), true, true)) task.cancel();
  };

  const download = async (entries: FileEntry[], dir: string) => {
    setDownloading(null);
    const paths = entries.map((f) => f.path);
    // A folder that cannot be listed has nothing that could be warned about.
    const there = (await commands.listLocal(dir).catch(() => null)) ?? [];
    if (!(await mayOverwrite(paths.map(localName), there))) return;
    await transfer((id) => commands.pullPaths(id, device.serial, paths, dir), {
      label: t("files.openFolder"),
      run: () => void commands.revealPath(dir),
    });
  };

  const upload = async (picked: string[]) => {
    setDialog(null);
    if (!(await mayOverwrite(picked.map(localName), files.data ?? []))) return;
    await transfer((id) => commands.pushPaths(id, device.serial, picked, path));
  };

  const drop = async (dropped: string[]) => {
    const question = t("files.dropConfirm", { count: dropped.length, path });
    if (await confirm(question, false, true)) await upload(dropped);
  };
  // The listener is set once, so it reaches the newest state through this.
  const onDrop = useRef({ busy: false, drop });
  useEffect(() => {
    onDrop.current = { busy: task.running || !!dialog || !!renaming || !!downloading, drop };
  });

  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    const listen = async () => {
      const unlisten = await getCurrentWebview().onDragDropEvent(({ payload }) => {
        // The page stays mounted while another module is shown.
        const visible = !!root.current?.offsetParent;
        // Nothing is dropped onto a question that waits for its answer.
        const asking = useConfirmStore.getState().request !== null;
        const free = visible && !asking && !onDrop.current.busy;
        if (payload.type === "enter") setDragging(free);
        else if (payload.type === "leave") setDragging(false);
        else if (payload.type === "drop") {
          setDragging(false);
          if (free && payload.paths.length) void onDrop.current.drop(payload.paths);
        }
      });
      if (gone) unlisten();
      else stop = unlisten;
    };
    // Outside of the app window there is nothing that could be dropped.
    void listen().catch(() => {});
    return () => {
      gone = true;
      stop?.();
    };
  }, []);

  const copyPaths = (entries: FileEntry[]) =>
    void navigator.clipboard
      .writeText(entries.map((f) => f.path).join("\n"))
      .then(() => feedback.success(t("files.pathCopied")))
      .catch((error: unknown) => feedback.failure(error));

  /** A right click on a selected row acts on the selection, on any other row on that row. */
  const rowMenu = (file: FileEntry): MenuEntry[] => {
    const entries = selection.has(file.path) ? selected : [file];
    return [
      {
        icon: Download,
        label: t("files.download"),
        run: () => setDownloading(entries),
        disabled: task.running,
      },
      {
        icon: Pencil,
        label: t("files.rename"),
        run: () => setRenaming(file),
        disabled: task.running || entries.length > 1,
      },
      { icon: Copy, label: t("files.copyPath"), run: () => copyPaths(entries) },
      {
        icon: Trash2,
        label: t("common.delete"),
        run: () => void remove(entries),
        disabled: task.running,
        danger: true,
      },
    ];
  };

  const folderMenu = (): MenuEntry[] => [
    {
      icon: FolderPlus,
      label: t("files.newFolder"),
      run: () => setDialog("mkdir"),
      disabled: task.running,
    },
    {
      icon: Upload,
      label: t("files.upload"),
      run: () => setDialog("upload"),
      disabled: task.running,
    },
    { icon: RefreshCw, label: t("common.refresh"), run: refresh },
  ];

  const join = (name: string) => (path === "/" ? `/${name}` : `${path}/${name}`);

  return (
    <div ref={root} className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-6 py-3">
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-y-0 left-1 z-10 flex items-center">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => go(parentPath(path))}
              disabled={path === "/"}
              aria-label={t("files.up")}
              className="size-8 border-transparent bg-transparent p-0 hover:border-transparent hover:bg-transparent"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
          <Input
            data-search
            className="px-9"
            aria-label={t("files.path")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && draft.startsWith("/") && go(draft.replace(/\/+$/, "") || "/")
            }
          />
          <div className="absolute inset-y-0 right-1 z-10 flex items-center">
            <Button
              size="sm"
              variant="ghost"
              onClick={refresh}
              aria-label={t("common.refresh")}
              className="size-8 border-transparent bg-transparent p-0 hover:border-transparent hover:bg-transparent"
            >
              <RefreshCw
                className="size-4 transition-transform duration-500"
                style={{ transform: `rotate(${refreshes * 360}deg)` }}
              />
            </Button>
          </div>
        </div>
        {searchOpen || search !== "" ? (
          <Input
            autoFocus
            className="w-48 shrink-0"
            placeholder={t("files.search")}
            aria-label={t("files.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              setSearch("");
              setSearchOpen(false);
            }}
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSearchOpen(true)}
            aria-label={t("files.search")}
            title={t("files.search")}
            className="size-9 shrink-0 p-0"
          >
            <Search className="size-4" />
          </Button>
        )}
        <div
          className="flex shrink-0 items-center gap-1.5"
          title={t("common.selected", { count: selection.count })}
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDialog("mkdir")}
            disabled={task.running}
            aria-label={t("files.newFolder")}
            title={t("files.newFolder")}
            className="size-9 p-0"
          >
            <FolderPlus className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => single && setRenaming(single)}
            disabled={!single || task.running}
            aria-label={t("files.rename")}
            title={t("files.rename")}
            className="size-9 p-0"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDownloading(selected)}
            disabled={!selected.length || task.running}
            aria-label={t("files.download")}
            title={t("files.download")}
            className="size-9 p-0"
          >
            <Download className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void remove(selected)}
            disabled={!selected.length || task.running}
            aria-label={t("common.delete")}
            title={t("common.delete")}
            className="size-9 p-0"
          >
            <Trash2 className="size-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => setDialog("upload")}
            disabled={task.running}
            className="h-9 shrink-0"
          >
            <Upload className="size-4" />
            {t("files.upload")}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-[24px_1fr_100px_220px] gap-x-6 px-6 py-1.5 label">
        <span />
        <SortButton label={t("files.name")} column="name" sort={sort} onSort={onSort} />
        <SortButton label={t("files.size")} column="size" sort={sort} onSort={onSort} right />
        <SortButton label={t("files.modified")} column="modified" sort={sort} onSort={onSort} />
      </div>
      <Menu entries={folderMenu}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          {refreshes > 0 && (
            <div
              key={refreshes}
              className="pointer-events-none absolute inset-0 z-10 animate-flash"
            />
          )}
          {files.isLoading ? (
            <div className="p-6">
              <Spinner label={t("common.loading")} />
            </div>
          ) : files.error ? (
            <p className="p-6 text-xs text-danger">
              {String((files.error as { detail?: string }).detail ?? files.error)}
            </p>
          ) : !sorted.length ? (
            <EmptyState icon={FolderOpen} text={t("files.empty")} />
          ) : (
            <Virtuoso
              className="flex-1"
              data={sorted}
              computeItemKey={(_, f) => f.path}
              itemContent={(_, file: FileEntry) => (
                <Menu entries={() => rowMenu(file)}>
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
                        <FileIcon name={file.name} />
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
                </Menu>
              )}
            />
          )}
        </div>
      </Menu>
      {task.running && (
        <TaskBar progress={task.progress} lane={task.lane} onCancel={() => void cancel()} />
      )}
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
      {renaming && (
        <NameDialog
          title={t("files.newName")}
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSubmit={(name) => {
            setRenaming(null);
            selection.clear();
            void act(() => commands.movePath(device.serial, renaming.path, join(name)));
          }}
        />
      )}
      {dialog === "upload" && (
        <UploadPicker onClose={() => setDialog(null)} onPick={(picked) => void upload(picked)} />
      )}
      {downloading && (
        <FolderPicker
          serial={device.serial}
          items={downloading}
          onClose={() => setDownloading(null)}
          onPick={(dir) => void download(downloading, dir)}
        />
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-neon bg-black/80">
          <p className="heading text-lg text-neon">{t("files.dropHere", { path })}</p>
        </div>
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
