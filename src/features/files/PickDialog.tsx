import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, File, Folder, FolderPlus, HardDrive, RefreshCw, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";

import { commands, type LocalEntry } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { cn } from "../../shared/lib/cn";
import { errorText } from "../../shared/lib/errors";
import { formatBytes, formatDate } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Checkbox, Input } from "../../shared/ui/Controls";
import { Dialog } from "../../shared/ui/Dialog";
import { Spinner } from "../../shared/ui/Feedback";
import { NameDialog } from "./NameDialog";
import { localName, localParent } from "./paths";
import { matches, nextSort, type Sort, sortFiles } from "./sort";
import { SortButton } from "./SortButton";

/** One line of the list on the right: what is going to be copied. */
interface Chosen {
  key: string;
  name: string;
  isDir: boolean;
  /** Null while it is being added up. */
  size: number | null;
}

/** What is going to be copied, with the sum of it. */
function ChosenList({ items, onRemove }: { items: Chosen[]; onRemove?: (key: string) => void }) {
  const { t } = useTranslation();
  const known = items.every((item) => item.size !== null);
  const total = items.reduce((sum, item) => sum + (item.size ?? 0), 0);
  return (
    <section className="flex w-64 shrink-0 flex-col border-l border-line pl-3">
      <p className="label mb-2">{t("pick.chosen", { count: items.length })}</p>
      <ul className="min-h-0 flex-1 overflow-auto">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 border-b border-white/5 py-1">
            {item.isDir ? (
              <Folder className="size-3.5 shrink-0 text-neon" />
            ) : (
              <File className="size-3.5 shrink-0 text-white/50" />
            )}
            <span className="min-w-0 flex-1 truncate" title={item.key}>
              {item.name}
            </span>
            <span className="shrink-0 text-[11px] text-white/50 tabular-nums">
              {item.size === null ? "..." : formatBytes(item.size)}
            </span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(item.key)}
                aria-label={t("pick.remove", { name: item.name })}
              >
                <X className="size-3.5 text-white/60 hover:text-white" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-white/60 tabular-nums">
        {t("pick.total", { size: known ? formatBytes(total) : "..." })}
      </p>
    </section>
  );
}

/** The folders of this PC: shortcuts, the path, a search and the entries of one folder. */
function Browser({
  foldersOnly,
  dir,
  onDir,
  row,
  tools,
  children,
}: {
  foldersOnly?: boolean;
  /** Null until the first folder is known. */
  dir: string | null;
  onDir: (dir: string) => void;
  /** The start of a row, before the icon. */
  row?: (entry: LocalEntry) => ReactNode;
  tools?: ReactNode;
  /** The list on the right. */
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const places = useQuery({ queryKey: ["localPlaces"], queryFn: () => commands.localPlaces() });
  const [draft, setDraft] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" });
  const entries = useQuery({
    queryKey: ["local", dir],
    queryFn: () => commands.listLocal(dir ?? ""),
    enabled: dir !== null,
    staleTime: 0,
    retry: false,
  });
  const shown = useMemo(
    () =>
      sortFiles(
        (entries.data ?? []).filter(
          (e) => (hidden || !e.isHidden) && (!foldersOnly || e.isDir) && matches(e.name, search),
        ),
        sort,
      ),
    [entries.data, hidden, foldersOnly, search, sort],
  );

  const go = (next: string) => {
    setSearch("");
    setDraft(null);
    onDir(next);
  };
  const parent = dir === null ? null : localParent(dir);
  const columns = "grid grid-cols-[24px_1fr_80px_150px] items-center gap-x-3 px-2";

  return (
    <div className="flex h-[min(420px,52vh)] gap-3">
      <nav
        className="flex w-36 shrink-0 flex-col gap-1 overflow-auto"
        aria-label={t("pick.places")}
      >
        {places.data?.map((place) => (
          <button
            key={place.path}
            type="button"
            onClick={() => go(place.path)}
            className={cn(
              "flex items-center gap-2 px-2 py-1 text-left hover:bg-neon/5",
              dir === place.path && "bg-neon/10 text-neon",
            )}
          >
            {place.kind === "drive" ? (
              <HardDrive className="size-3.5 shrink-0" />
            ) : (
              <Folder className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {place.kind === "drive" ? place.path : t(`pick.place.${place.kind}`)}
            </span>
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => parent && go(parent)}
            disabled={!parent}
            aria-label={t("files.up")}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Input
            aria-label={t("pick.path")}
            value={draft ?? dir ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && draft?.trim() && go(draft.trim())}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void entries.refetch()}
            aria-label={t("common.refresh")}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Input
            className="flex-1"
            placeholder={t("files.search")}
            aria-label={t("files.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Checkbox checked={hidden} onChange={setHidden} label={t("pick.hidden")} />
          {tools}
        </div>
        <div className={cn(columns, "label")}>
          <span />
          {(["name", "size", "modified"] as const).map((column) => (
            <SortButton
              key={column}
              label={t(`files.${column}`)}
              column={column}
              sort={sort}
              onSort={(key) => setSort((s) => nextSort(s, key))}
              right={column === "size"}
            />
          ))}
        </div>
        {entries.error ? (
          <p className="p-2 text-danger">{errorText(t, entries.error)}</p>
        ) : entries.isLoading || dir === null ? (
          <Spinner label={t("common.loading")} />
        ) : !shown.length ? (
          <p className="p-2 text-white/50">{t("files.empty")}</p>
        ) : (
          <Virtuoso
            className="flex-1"
            data={shown}
            computeItemKey={(_, e) => e.path}
            itemContent={(_, entry: LocalEntry) => (
              <div
                // A folder opens; a file is picked by clicking anywhere on its row.
                onClick={(event) => {
                  if (entry.isDir) go(entry.path);
                  else event.currentTarget.querySelector("button")?.click();
                }}
                className={cn(
                  columns,
                  "cursor-pointer border-b border-white/5 py-1 hover:bg-neon/5",
                )}
              >
                <span>{row?.(entry)}</span>
                <span className="flex min-w-0 items-center gap-2">
                  {entry.isDir ? (
                    <Folder className="size-3.5 shrink-0 text-neon" />
                  ) : (
                    <File className="size-3.5 shrink-0 text-white/50" />
                  )}
                  <span className={cn("truncate", entry.isHidden && "text-white/50")}>
                    {entry.name}
                  </span>
                </span>
                <span className="text-right text-white/60 tabular-nums">
                  {entry.isDir ? "" : formatBytes(entry.size)}
                </span>
                <span className="truncate text-white/50">
                  {entry.modified ? formatDate(entry.modified, i18n.language) : ""}
                </span>
              </div>
            )}
          />
        )}
      </div>
      {children}
    </div>
  );
}

/** The folder that the window opens in: the downloads folder, which comes first. */
function useStartDir() {
  const [chosen, setDir] = useState<string | null>(null);
  const places = useQuery({ queryKey: ["localPlaces"], queryFn: () => commands.localPlaces() });
  return [chosen ?? places.data?.[0]?.path ?? null, setDir] as const;
}

/** Picks files and folders of this PC to upload, from as many folders as needed. */
export function UploadPicker({
  onPick,
  onClose,
}: {
  onPick: (paths: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [dir, setDir] = useStartDir();
  const [chosen, setChosen] = useState<LocalEntry[]>([]);
  const folders = chosen.filter((e) => e.isDir);
  const sizes = useQueries({
    queries: folders.map((folder) => ({
      queryKey: ["localSize", folder.path],
      queryFn: () => commands.localSize(folder.path),
    })),
  });
  const sizeOf = (entry: LocalEntry) =>
    entry.isDir ? (sizes[folders.indexOf(entry)]?.data ?? null) : entry.size;

  const remove = (path: string) => setChosen((all) => all.filter((e) => e.path !== path));
  /** Another chosen entry with the same name would land on top of this one on the phone. */
  const taken = (entry: LocalEntry) =>
    chosen.some(
      (e) => e.path !== entry.path && e.name.toLocaleLowerCase() === entry.name.toLocaleLowerCase(),
    );
  const [clash, setClash] = useState<string | null>(null);
  const toggle = (entry: LocalEntry) => {
    setClash(null);
    if (chosen.some((e) => e.path === entry.path)) remove(entry.path);
    else if (taken(entry)) setClash(entry.name);
    else setChosen((all) => [...all, entry]);
  };

  return (
    <Dialog
      open
      huge
      onOpenChange={(open) => !open && onClose()}
      title={t("pick.uploadTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onPick(chosen.map((e) => e.path))} disabled={!chosen.length}>
            {t("files.upload")}
          </Button>
        </>
      }
    >
      <Browser
        dir={dir}
        onDir={setDir}
        row={(entry) => (
          <Checkbox
            checked={chosen.some((e) => e.path === entry.path)}
            onChange={() => toggle(entry)}
          />
        )}
      >
        <ChosenList
          items={chosen.map((e) => ({
            key: e.path,
            name: e.name,
            isDir: e.isDir,
            size: sizeOf(e),
          }))}
          onRemove={remove}
        />
      </Browser>
      {clash !== null && (
        <p className="text-warn" role="alert">
          {t("pick.sameName", { name: clash })}
        </p>
      )}
    </Dialog>
  );
}

/** Picks the PC folder that phone files are downloaded to. */
export function FolderPicker({
  serial,
  items,
  onPick,
  onClose,
}: {
  serial: string;
  /** The phone entries that are going to be downloaded. */
  items: { path: string; isDir: boolean; size: number | null }[];
  onPick: (dir: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const feedback = useFeedback();
  const [dir, setDir] = useStartDir();
  const [naming, setNaming] = useState(false);
  const paths = items.map((i) => i.path);
  const sizes = useQuery({
    queryKey: ["pathSizes", serial, paths],
    queryFn: () => commands.getPathSizes(serial, paths),
  });

  const make = async (name: string) => {
    setNaming(false);
    if (dir === null) return;
    try {
      const made = await commands.makeLocalDir(dir, name);
      await client.invalidateQueries({ queryKey: ["local", dir] });
      setDir(made);
    } catch (error) {
      feedback.failure(error);
    }
  };

  return (
    <Dialog
      open
      huge
      onOpenChange={(open) => !open && onClose()}
      title={t("pick.downloadTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => dir !== null && onPick(dir)} disabled={dir === null}>
            {t("pick.downloadHere")}
          </Button>
        </>
      }
    >
      <Browser
        foldersOnly
        dir={dir}
        onDir={setDir}
        tools={
          <Button size="sm" variant="ghost" onClick={() => setNaming(true)} disabled={dir === null}>
            <FolderPlus className="size-3" />
            {t("files.newFolder")}
          </Button>
        }
      >
        <ChosenList
          items={items.map((item, index) => ({
            key: item.path,
            name: localName(item.path),
            isDir: item.isDir,
            size: sizes.data?.[index] ?? (item.isDir ? null : item.size),
          }))}
        />
      </Browser>
      {naming && (
        <NameDialog
          title={t("files.folderName")}
          initial=""
          onClose={() => setNaming(false)}
          onSubmit={(name) => void make(name)}
        />
      )}
    </Dialog>
  );
}
