import { useQuery } from "@tanstack/react-query";

import { useAppStore } from "../../app/store";
import { commands, type DeviceEntry } from "../../bindings";

const NONE: DeviceEntry[] = [];

export function useDevices() {
  const query = useQuery({
    queryKey: ["devices"],
    queryFn: () => commands.listDevices(),
    refetchInterval: 2000,
    retry: false,
  });
  const serial = useAppStore((s) => s.serial);
  const devices = query.data ?? NONE;

  // `useConnections` keeps the selection valid; until it does, a ready device stands in.
  const selected: DeviceEntry | null =
    devices.find((d) => d.serial === serial) ??
    devices.find((d) => d.state === "device") ??
    devices[0] ??
    null;
  return {
    devices,
    selected,
    error: query.error,
    isLoading: query.isLoading,
    isLoaded: query.data !== undefined,
  };
}
