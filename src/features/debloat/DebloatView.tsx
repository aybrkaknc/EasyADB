import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Eraser, FileDown, FileUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";

import {
  commands,
  type DebloatAction,
  type DebloatApp,
  type DeviceEntry,
  type ProfileEntry,
} from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useSelection } from "../../shared/hooks/useSelection";
import { useTask } from "../../shared/hooks/useTask";
import { cn } from "../../shared/lib/cn";
import { appName } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Checkbox, FilterChips, Input } from "../../shared/ui/Controls";
import { DeviceGuard } from "../../shared/ui/DeviceGuard";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { Badge, EmptyState, Spinner, TaskBar } from "../../shared/ui/Feedback";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { canApplyTo, REMOVAL_TONE, statusKey } from "./debloat";
import { DebloatDetails } from "./DebloatDetails";

const FILTERS = [
  "all",
  "Recommended",
  "Advanced",
  "Expert",
  "Unsafe",
  "unknown",
  "disabled",
  "uninstalled",
] as const;
type Filter = (typeof FILTERS)[number];

const ROW_ACTIONS: DebloatAction[] = ["disable", "enable", "restore", "uninstall"];
const ACTION_VARIANT = {
  disable: "ghost",
  enable: "ghost",
  restore: "primary",
  uninstall: "danger",
} as const;

function matches(item: DebloatApp, filter: Filter) {
  switch (filter) {
    case "all":
      return true;
    case "unknown":
      return !item.info;
    case "disabled":
      return item.app.installed && item.app.disabled;
    case "uninstalled":
      return !item.app.installed;
    default:
      return item.info?.removal === filter;
  }
}

function Debloater({ device }: { device: DeviceEntry }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const feedback = useFeedback();
  const confirm = useConfirm();
  const task = useTask();
  const selection = useSelection();
  const [filter, setFilter] = useState<Filter>("Recommended");
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["debloat", device.serial],
    queryFn: () => commands.listDebloatApps(device.serial),
  });
  const items = useMemo(() => query.data ?? [], [query.data]);
  const byPackage = useMemo(() => new Map(items.map((i) => [i.app.package, i])), [items]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    // A search looks through every app; the filter only narrows the list when nothing is searched.
    if (term) {
      return items.filter(
        (i) => i.app.package.includes(term) || appName(i.app).toLowerCase().includes(term),
      );
    }
    return items.filter((i) => matches(i, filter));
  }, [items, filter, search]);

  const apply = async (entries: ProfileEntry[], skipped = 0, keepSelection = false) => {
    if (entries.length === 0) return;
    try {
      const outcomes = await task.run((id) => commands.applyDebloat(id, device.serial, entries));
      const failed = outcomes.filter((o) => o.error);
      feedback.success(
        t("debloat.result", { ok: outcomes.length - failed.length, failed: failed.length }),
        true,
      );
      failed.forEach((o) => feedback.failure(o.error));
      if (skipped > 0) feedback.warning(t("debloat.skipped", { count: skipped }));
      if (!keepSelection) selection.clear();
    } catch (error) {
      feedback.failure(error, true);
    }
    void client.invalidateQueries({ queryKey: ["debloat", device.serial] });
  };

  /** Selected packages the action applies to, given their current state. */
  const eligibleFor = (action: DebloatAction) =>
    selection.ids.filter((id) => {
      const item = byPackage.get(id);
      return item !== undefined && canApplyTo(action, item);
    });

  /** Runs an action on the selection, or on `only` when a single row's button was used. */
  const run = async (action: DebloatAction, only?: string) => {
    const ids = only ? [only] : eligibleFor(action);
    if (ids.length === 0) return;
    if (
      action === "uninstall" &&
      !(await confirm(t("debloat.confirmUninstall", { count: ids.length })))
    )
      return;
    await apply(
      ids.map((pkg) => ({ package: pkg, action })),
      only ? 0 : selection.count - ids.length,
      Boolean(only),
    );
  };

  const saveProfile = async () => {
    const path = await save({
      defaultPath: "debloat-profile.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    const entries: ProfileEntry[] = items
      .filter((i) => !i.app.installed || i.app.disabled)
      .map((i) => ({ package: i.app.package, action: i.app.installed ? "disable" : "uninstall" }));
    try {
      await commands.saveDebloatProfile(path, t("debloat.profile.name"), entries);
      feedback.success(t("debloat.profile.saved"));
    } catch (error) {
      feedback.failure(error);
    }
  };

  const loadProfile = async () => {
    const path = await open({ filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return;
    try {
      const profile = await commands.loadDebloatProfile(path);
      const entries = profile.entries.filter((e) => byPackage.has(e.package));
      selection.replace(entries.map((e) => e.package));
      feedback.success(t("debloat.profile.loaded", { count: entries.length }));
      if (
        entries.some((e) => e.action === "uninstall") &&
        !(await confirm(t("debloat.confirmUninstall", { count: entries.length })))
      )
        return;
      await apply(entries);
    } catch (error) {
      feedback.failure(error);
    }
  };

  const disabledFor = (action: DebloatAction) => task.running || eligibleFor(action).length === 0;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            value: f,
            label: t(`debloat.filter.${f}`),
            count: items.filter((i) => matches(i, f)).length,
          }))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <div className="relative min-w-0 max-w-64 flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <Search className="size-3.5 text-white/50" aria-hidden />
          </div>
          <Input
            data-search
            className="pl-9"
            placeholder={t("debloat.search")}
            aria-label={t("debloat.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Checkbox
          checked={visible.length > 0 && visible.every((i) => selection.has(i.app.package))}
          onChange={(on) =>
            selection.setAll(
              visible.map((i) => i.app.package),
              on,
            )
          }
          label={t("common.selectAll")}
        />
        {selection.count > 0 && (
          <span className="text-[11px] text-white/50">
            {t("common.selected", { count: selection.count })}
          </span>
        )}
        <div className="flex flex-wrap gap-1.5">
          {selection.count > 0 &&
            ROW_ACTIONS.map((action) => (
              <Button
                key={action}
                size="sm"
                variant={ACTION_VARIANT[action]}
                onClick={() => void run(action)}
                disabled={disabledFor(action)}
              >
                {t(`debloat.action.${action}`)}
              </Button>
            ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void saveProfile()}
            disabled={task.running}
            aria-label={t("debloat.profile.save")}
            title={t("debloat.profile.save")}
            className="size-9 p-0"
          >
            <FileDown className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void loadProfile()}
            disabled={task.running}
            aria-label={t("debloat.profile.load")}
            title={t("debloat.profile.load")}
            className="size-9 p-0"
          >
            <FileUp className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 border-t border-line">
        <div className="flex min-w-0 flex-1 flex-col">
          {query.isLoading ? (
            <div className="p-6">
              <Spinner label={t("common.loading")} />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState icon={Eraser} text={t("backup.empty")} />
          ) : (
            <Virtuoso
              className="flex-1"
              data={visible}
              computeItemKey={(_, item) => item.app.package}
              itemContent={(_, item) => (
                <div
                  onClick={() => setFocused(item.app.package)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b border-white/5 px-6 py-2 hover:bg-neon/5",
                    focused === item.app.package && "bg-neon/10",
                  )}
                >
                  <Checkbox
                    checked={selection.has(item.app.package)}
                    onChange={() => selection.toggle(item.app.package)}
                  />
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2",
                      !item.app.installed && "opacity-40",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs text-white">{appName(item.app)}</p>
                      <p className="truncate text-[11px] text-white/40">{item.app.package}</p>
                    </div>
                    {item.info ? (
                      <Badge tone={REMOVAL_TONE[item.info.removal]}>
                        {t(`debloat.filter.${item.info.removal}`)}
                      </Badge>
                    ) : (
                      <Badge>{t("debloat.filter.unknown")}</Badge>
                    )}
                    {statusKey(item.app) !== "enabled" && (
                      <Badge>{t(`debloat.status.${statusKey(item.app)}`)}</Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {ROW_ACTIONS.filter((action) => canApplyTo(action, item)).map((action) => (
                      <Button
                        key={action}
                        size="sm"
                        variant={ACTION_VARIANT[action]}
                        onClick={() => void run(action, item.app.package)}
                        disabled={task.running}
                      >
                        {t(`debloat.action.${action}`)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            />
          )}
        </div>
        <aside className="w-80 shrink-0 overflow-auto border-l border-line">
          <DebloatDetails item={focused ? (byPackage.get(focused) ?? null) : null} />
        </aside>
      </div>
      {task.running && <TaskBar progress={task.progress} onCancel={task.cancel} />}
    </div>
  );
}

export function DebloatView() {
  const { t } = useTranslation();
  return (
    <>
      <ModuleHeader icon={Eraser} title={t("modules.debloat.title")} />
      <DeviceGuard>{(device) => <Debloater key={device.serial} device={device} />}</DeviceGuard>
    </>
  );
}
