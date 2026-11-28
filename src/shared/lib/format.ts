const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "-";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

export function formatDate(value: string | number, locale: string): string {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/** Minutes and seconds, as in `1:05`. */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function percent(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (current / total) * 100));
}

/** Display name for an app: its known label, otherwise a readable form of the package name. */
export function appName(app: { label?: string | null; package: string }): string {
  return app.label ?? prettyPackage(app.package);
}

/** Readable fallback name for a package without a known label: "com.foo.my_app" -> "My App". */
export function prettyPackage(pkg: string): string {
  const last = pkg.split(".").pop() ?? pkg;
  return last
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
