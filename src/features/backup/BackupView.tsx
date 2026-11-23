import { Archive } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useDevices } from "../../shared/hooks/useDevices";
import { Tabs, TabsContent, TabsList } from "../../shared/ui/Controls";
import { DeviceGuard } from "../../shared/ui/DeviceGuard";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { AppsTab } from "./AppsTab";
import { ArchiveTab } from "./ArchiveTab";

export function BackupView() {
  const { t } = useTranslation();
  const { selected } = useDevices();
  const [tab, setTab] = useState("apps");
  return (
    <>
      <ModuleHeader
        icon={Archive}
        title={t("modules.backup.title")}
        subtitle={t("modules.backup.subtitle")}
      />
      <Tabs value={tab} onValueChange={setTab} className="relative flex min-h-0 flex-1 flex-col">
        <TabsList
          tabs={[
            { value: "apps", label: t("backup.tabs.apps") },
            { value: "archive", label: t("backup.tabs.archive") },
          ]}
        />
        <TabsContent value="apps" className="flex min-h-0 flex-1 data-[state=inactive]:hidden">
          <DeviceGuard>
            {(device) => (
              <AppsTab key={device.serial} device={device} onDone={() => setTab("archive")} />
            )}
          </DeviceGuard>
        </TabsContent>
        <TabsContent value="archive" className="flex min-h-0 flex-1 data-[state=inactive]:hidden">
          <ArchiveTab device={selected} />
        </TabsContent>
      </Tabs>
    </>
  );
}
