import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { commands, type Settings_Serialize } from "../../bindings";

export type Settings = Settings_Serialize;

export const DEFAULT_SETTINGS: Settings = {
  language: null,
  backupDir: null,
  notifications: true,
  sound: true,
  confirmDestructive: true,
  fileLogging: true,
  verifyHashOnRestore: false,
  closeToTray: true,
};

export function useSettings() {
  const query = useQuery({ queryKey: ["settings"], queryFn: () => commands.getSettings() });
  return query.data ?? DEFAULT_SETTINGS;
}

export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Settings) => {
      await commands.saveSettings(settings);
      return settings;
    },
    onSuccess: (settings) => {
      client.setQueryData(["settings"], settings);
      void client.invalidateQueries({ queryKey: ["backups"] });
    },
  });
}
