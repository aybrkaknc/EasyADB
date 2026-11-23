import type { AppInfo, DebloatAction, DebloatApp, Removal } from "../../bindings";

export const REMOVAL_TONE: Record<Removal, "neon" | "warn" | "danger" | "muted"> = {
  Recommended: "neon",
  Advanced: "warn",
  Expert: "warn",
  Unsafe: "danger",
};

export function statusKey(app: AppInfo) {
  if (!app.installed) return "uninstalled";
  return app.disabled ? "disabled" : "enabled";
}

/** Whether an action makes sense for an app in its current state. */
export function canApply(action: DebloatAction, app: AppInfo): boolean {
  switch (action) {
    case "disable":
      return app.installed && !app.disabled;
    case "enable":
      return app.installed && app.disabled;
    case "uninstall":
      return app.installed;
    case "restore":
      return !app.installed;
  }
}

/** `canApply`, and protected packages (system UI, Unsafe in the list) are never disabled or removed. */
export function canApplyTo(action: DebloatAction, item: DebloatApp): boolean {
  const removes = action === "disable" || action === "uninstall";
  return canApply(action, item.app) && !(removes && item.protected);
}

/** Google search for an app: its name (when known) and package name. */
export function webSearchUrl(app: AppInfo): string {
  const query = [app.label, app.package, "android"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
