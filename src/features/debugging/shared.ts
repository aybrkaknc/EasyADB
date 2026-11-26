import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type DebugSetting, type DeviceEntry } from "../../bindings";
import { quiet } from "../../shared/hooks/quiet";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { phoneKey } from "../../shared/lib/phones";

export const ADDRESS = /^[A-Za-z0-9.-]+:\d{1,5}$/;

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const wrap = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };
  return { busy, wrap };
}

export function useDiscovery() {
  return useQuery({
    queryKey: ["discovery"],
    queryFn: () => commands.wirelessDiscover(),
    refetchInterval: 3000,
  });
}

export function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["discovery"] });
    void client.invalidateQueries({ queryKey: ["devices"] });
  };
}

/** The debugging settings of a ready phone, and the way to change one. */
export function useDebugSettings(device: DeviceEntry | null) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const feedback = useFeedback();
  const query = useQuery({
    queryKey: ["debugSettings", device?.serial],
    queryFn: () => commands.getDebugSettings(device!.serial),
    enabled: device !== null,
    refetchInterval: 5000,
  });
  /** What was asked for and is not confirmed yet. */
  const [pending, setPending] = useState<DebugSetting | null>(null);
  const change = async (setting: DebugSetting) => {
    if (!device) return;
    // Some settings cut the connection, which is no news to the user then.
    quiet(phoneKey(device));
    setPending(setting);
    try {
      await commands.setDebugSetting(device.serial, setting);
      feedback.success(t("debugging.settings.changed"));
    } catch (error) {
      feedback.failure(error);
    }
    await client.invalidateQueries({ queryKey: ["debugSettings", device.serial] });
    setPending(null);
  };
  return { settings: query.data, error: query.error, pending, change };
}
