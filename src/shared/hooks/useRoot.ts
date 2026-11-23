import { useQuery } from "@tanstack/react-query";

import { commands } from "../../bindings";

/**
 * Whether `su` works for the device's shell. The first check makes the device ask for root,
 * so it only runs where app data is involved and is cached per device until refreshed.
 */
export function useRoot(serial: string | null) {
  const query = useQuery({
    queryKey: ["root", serial],
    queryFn: () => commands.checkDeviceRoot(serial!),
    enabled: serial !== null,
    staleTime: Infinity,
    retry: false,
  });
  return {
    /** `true` only once root has been confirmed. */
    isRoot: query.data === true,
    checking: query.isFetching,
    recheck: () => void query.refetch(),
  };
}
