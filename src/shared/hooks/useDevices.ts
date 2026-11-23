import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useAppStore } from "../../app/store";
import { commands, type DeviceEntry } from "../../bindings";

export function useDevices() {
  const query = useQuery({
    queryKey: ["devices"],
    queryFn: () => commands.listDevices(),
    refetchInterval: 2000,
    retry: false,
  });
  const serial = useAppStore((s) => s.serial);
  const setSerial = useAppStore((s) => s.setSerial);
  const devices = query.data ?? [];

  // Keep the selection valid: prefer a ready device when the current one disappears.
  useEffect(() => {
    if (!query.data) return;
    if (serial && query.data.some((d) => d.serial === serial)) return;
    const next = query.data.find((d) => d.state === "device") ?? query.data[0];
    setSerial(next?.serial ?? null);
  }, [query.data, serial, setSerial]);

  const selected: DeviceEntry | null = devices.find((d) => d.serial === serial) ?? null;
  return { devices, selected, error: query.error, isLoading: query.isLoading };
}
