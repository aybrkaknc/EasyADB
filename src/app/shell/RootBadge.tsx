import { Loader, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DeviceEntry } from "../../bindings";
import { useRoot } from "../../shared/hooks/useRoot";

/** Icon-only root status of a device; checked once per device and cached. */
export function RootBadge({ device }: { device: DeviceEntry }) {
  const { t } = useTranslation();
  const root = useRoot(device.state === "device" ? device.serial : null);
  if (device.state !== "device") return null;

  const [Icon, key, color] = root.checking
    ? [Loader, "checking", "text-white/40"]
    : root.isRoot
      ? [ShieldCheck, "yes", "text-neon"]
      : [ShieldAlert, "no", "text-warn"];
  const label = t(`titlebar.root.${key}`);
  return (
    <span title={label} aria-label={label} role="img" className={`flex shrink-0 ${color}`}>
      <Icon className="size-4" />
    </span>
  );
}
