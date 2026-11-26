import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../../app/store";
import type { DeviceEntry } from "../../bindings";
import { useDeviceFree } from "../jobs/store";
import { connectionChanges, pickSerial } from "../lib/phones";
import { isQuiet } from "./quiet";
import { useDevices } from "./useDevices";
import { useToasts } from "./useToasts";

/**
 * Keeps the selected connection valid and tells about phones that come and go. Used once, by the
 * application.
 */
export function useConnections() {
  const { t } = useTranslation();
  const { devices, isLoaded } = useDevices();
  const serial = useAppStore((s) => s.serial);
  const pinned = useAppStore((s) => s.pinned);
  const free = useDeviceFree();
  const push = useToasts((s) => s.push);
  const before = useRef<{ devices: DeviceEntry[]; serial: string | null } | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    const last = before.current;
    const next = pickSerial(last?.devices ?? [], devices, { serial, pinned }, free);
    // The first list is how things are, not news.
    if (last) {
      for (const change of connectionChanges(last.devices, devices, last.serial, next.serial)) {
        if (isQuiet(change.key)) continue;
        push(
          change.kind === "authorize" ? "warning" : "info",
          t(`connection.${change.kind}`, { name: change.name }),
        );
      }
    }
    before.current = { devices, serial: next.serial };
    if (next.serial !== serial || next.pinned !== pinned) useAppStore.setState(next);
  }, [devices, isLoaded, serial, pinned, free, push, t]);
}
