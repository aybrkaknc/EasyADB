import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";

import { type AppInfo, commands, type DeviceEntry } from "../../bindings";
import { useRoot } from "../../shared/hooks/useRoot";
import { useSelection } from "../../shared/hooks/useSelection";
import { reportOutcomes, runJob } from "../../shared/jobs/store";
import { cn } from "../../shared/lib/cn";
import { appName, formatBytes } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Checkbox, FilterChips, Input } from "../../shared/ui/Controls";
import { EmptyState, Spinner } from "../../shared/ui/Feedback";
import { Panel } from "../../shared/ui/Panel";
import { RootStatus } from "./RootStatus";
import { PhoneDataTab } from "./PhoneDataTab";

type Filter = "user" | "system" | "all";

function BackupOptionsPanel({
  value,
  onChange,
  root,
}: {
  value: { obb: boolean; data: boolean; external: boolean };
  onChange: (v: Partial<typeof value>) => void;
  root: ReturnType<typeof useRoot>;
}) {
  const { t } = useTranslation();
  const rootOnly = (name: string) => (
    <span className="flex flex-col">
      {name}
      <span className="text-[11px] text-white/40">{t("backup.options.needsRoot")}</span>
    </span>
  );
  return (
    <Panel title={t("backup.options.title")}>
      <div className="flex flex-col gap-2.5">
        <Checkbox
          checked={value.obb}
          onChange={(obb) => onChange({ obb })}
          label={t("backup.options.obb")}
        />
        <Checkbox
          checked={value.data && root.isRoot}
          onChange={(data) => onChange({ data })}
          disabled={!root.isRoot}
          label={rootOnly(t("backup.options.data"))}
        />
        <Checkbox
          checked={value.external && root.isRoot}
          onChange={(external) => onChange({ external })}
          disabled={!root.isRoot}
          label={rootOnly(t("backup.options.external"))}
        />
        <RootStatus root={root} />
      </div>
    </Panel>
  );
}

export function AppsTab({ device, onDone }: { device: DeviceEntry; onDone: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const selection = useSelection();
  const [filter, setFilter] = useState<Filter>("user");
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState({ obb: true, data: false, external: false });
  const root = useRoot(device.serial);

  const apps = useQuery({
    queryKey: ["apps", device.serial],
    queryFn: () => commands.listDeviceApps(device.serial),
  });
  const installed = useMemo(() => (apps.data ?? []).filter((a) => a.installed), [apps.data]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return installed.filter(
      (app) =>
        (filter === "all" || (filter === "system") === app.system) &&
        (!term || app.package.includes(term) || appName(app).toLowerCase().includes(term)),
    );
  }, [installed, filter, search]);

  const selectedIds = [...selection.ids].sort();
  const sizes = useQuery({
    queryKey: ["sizes", device.serial, selectedIds],
    queryFn: () => commands.getAppSizes(device.serial, selectedIds),
    enabled: selectedIds.length > 0 && selectedIds.length <= 400,
  });
  const estimate = (sizes.data ?? []).reduce(
    (sum, s) => sum + (s.apkBytes ?? 0) + (options.obb ? (s.obbBytes ?? 0) : 0),
    0,
  );
  const allVisible = visible.length > 0 && visible.every((a) => selection.has(a.package));

  const start = async (packages: string[]) => {
    const name = (pkg: string) =>
      appName(installed.find((a) => a.package === pkg) ?? { package: pkg });
    const outcomes = await runJob({
      kind: "app",
      serial: device.serial,
      device: device.model ?? device.serial,
      items: packages.map((pkg) => ({ key: pkg, name: name(pkg) })),
      parts: [
        "apk",
        ...(options.obb ? ["obb"] : []),
        ...(options.data && root.isRoot ? ["data"] : []),
        ...(options.external && root.isRoot ? ["external"] : []),
      ],
      run: ({ taskId }) =>
        commands.startBackup(taskId, device.serial, packages, {
          includeObb: options.obb,
          includeData: options.data && root.isRoot,
          includeExternal: options.external && root.isRoot,
        }),
      report: (list) =>
        list.map((o) => {
          const [line] = reportOutcomes([{ id: o.package, error: o.error }], name);
          return !o.error && o.dataSkipped
            ? { key: o.package, state: "warning", note: t("job.note.dataSkipped") }
            : { key: o.package, state: line?.state ?? "done", note: line?.note };
        }),
      retry: (keys) => void start(keys),
    });
    if (!outcomes) return;
    selection.clear();
    void client.invalidateQueries({ queryKey: ["backups"] });
    if (outcomes.every((o) => !o.error)) onDone();
  };

  const count = (f: Filter) =>
    installed.filter((a) => f === "all" || (f === "system") === a.system).length;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={(["user", "system", "all"] as Filter[]).map((f) => ({
              value: f,
              label: t(`backup.filter.${f}`),
              count: count(f),
            }))}
          />
          <Input
            data-search
            className="max-w-64"
            placeholder={t("backup.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Checkbox
            checked={allVisible}
            onChange={(on) =>
              selection.setAll(
                visible.map((a) => a.package),
                on,
              )
            }
            label={t("common.selectAll")}
          />
        </div>
        {apps.isLoading ? (
          <div className="p-6">
            <Spinner label={t("common.loading")} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon={PackageSearch} text={t("backup.empty")} />
        ) : (
          <Virtuoso
            className="flex-1"
            data={visible}
            computeItemKey={(_, app) => app.package}
            itemContent={(_, app: AppInfo) => (
              <div
                onClick={() => selection.toggle(app.package)}
                className={cn(
                  "mx-6 flex cursor-pointer items-center gap-3 border-b border-white/5 px-2 py-2 hover:bg-neon/5",
                  selection.has(app.package) && "bg-neon/10",
                )}
              >
                <Checkbox
                  checked={selection.has(app.package)}
                  onChange={() => selection.toggle(app.package)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-white">{appName(app)}</p>
                  <p className="truncate text-[11px] text-white/40">{app.package}</p>
                </div>
                {app.system && <span className="label">{t("backup.filter.system")}</span>}
              </div>
            )}
          />
        )}
      </div>
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-auto border-l border-line p-4">
        <BackupOptionsPanel
          value={options}
          onChange={(patch) => setOptions((o) => ({ ...o, ...patch }))}
          root={root}
        />
        <div className="flex flex-col gap-2 text-xs text-white/70">
          <span>{t("common.selected", { count: selection.count })}</span>
          {selection.count > 0 && (
            <span>
              {t("backup.estimate", { size: sizes.isFetching ? "..." : formatBytes(estimate) })}
            </span>
          )}
          {filter !== "user" && <span className="text-warn/80">{t("backup.systemHint")}</span>}
        </div>
        <Button onClick={() => void start(selectedIds)} disabled={selection.count === 0}>
          {t("backup.start", { count: selection.count })}
        </Button>
        <div className="mt-auto">
          <PhoneDataTab device={device} />
        </div>
      </aside>
    </div>
  );
}
