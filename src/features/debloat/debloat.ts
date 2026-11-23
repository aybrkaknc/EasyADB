import type { DebloatApp, Removal } from "../../bindings";

export const REMOVAL_TONE: Record<Removal, "neon" | "warn" | "danger" | "muted"> = {
  Recommended: "neon",
  Advanced: "warn",
  Expert: "warn",
  Unsafe: "danger",
};

export function statusKey(app: DebloatApp["app"]) {
  if (!app.installed) return "uninstalled";
  return app.disabled ? "disabled" : "enabled";
}
