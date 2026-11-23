import type { TFunction } from "i18next";

import type { RestoreReport } from "../../bindings";

/** Warnings worth showing after a restore: data that was skipped or permissions that did not apply. */
export function restoreWarnings(t: TFunction, name: string, report: RestoreReport): string[] {
  const warnings: string[] = [];
  if (report.data === "no_root") warnings.push(t("backup.restore.report.noRoot", { name }));
  if (report.data === "failed") {
    warnings.push(t("backup.restore.report.failed", { name, detail: report.detail ?? "" }));
  }
  const granted = report.permissionsGranted ?? 0;
  const total = report.permissionsTotal ?? 0;
  if (total > 0 && granted < total) {
    warnings.push(t("backup.restore.report.permissions", { name, granted, total }));
  }
  return warnings;
}
