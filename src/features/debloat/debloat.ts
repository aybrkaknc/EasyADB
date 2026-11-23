import type { AppInfo, DebloatAction, Removal } from "../../bindings";

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

/** Google search for an app: its name (when known) and package name. */
export function webSearchUrl(app: AppInfo): string {
  const query = [app.label, app.package, "android"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
