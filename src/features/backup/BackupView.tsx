import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../../app/store";
import { Tabs, TabsContent, TabsList } from "../../shared/ui/Controls";
import { DeviceGuard } from "../../shared/ui/DeviceGuard";
import { MODULE_ICONS } from "../../app/modules";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { AppsTab } from "./AppsTab";
import { FoldersTab } from "./FoldersTab";

export function BackupView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("apps");
  // Once a backup is made, its list is in the restore module.
  const setModule = useAppStore((s) => s.setModule);
  return (
    <>
      <ModuleHeader icon={MODULE_ICONS.backup} title={t("modules.backup.title")} />
      <Tabs value={tab} onValueChange={setTab} className="relative flex min-h-0 flex-1 flex-col">
        <TabsList
          tabs={[
            { value: "apps", label: t("backup.tabs.apps") },
            { value: "folders", label: t("backup.tabs.folders") },
          ]}
        />
        <TabsContent value="apps" className="flex min-h-0 flex-1 data-[state=inactive]:hidden">
          <DeviceGuard>
            {(device) => (
              <AppsTab key={device.serial} device={device} onDone={() => setModule("restore")} />
            )}
          </DeviceGuard>
        </TabsContent>
        <TabsContent value="folders" className="flex min-h-0 flex-1 data-[state=inactive]:hidden">
          <DeviceGuard>
            {(device) => (
              <FoldersTab key={device.serial} device={device} onDone={() => setModule("restore")} />
            )}
          </DeviceGuard>
        </TabsContent>
      </Tabs>
    </>
  );
}
