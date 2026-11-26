import { Bug } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../../app/store";
import { useDevices } from "../../shared/hooks/useDevices";
import { Tabs, TabsContent, TabsList } from "../../shared/ui/Controls";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { PcTab } from "./PcTab";
import { PhoneSettingsTab } from "./PhoneSettingsTab";
import { UsbTab } from "./UsbTab";
import { WirelessTab } from "./WirelessTab";

const TABS = ["usb", "wireless", "settings", "pc"] as const;

export function DebuggingView() {
  const { t } = useTranslation();
  const active = useAppStore((s) => s.module === "debugging");
  const { selected, isLoading } = useDevices();
  const [tab, setTab] = useState<string | null>(null);
  // Each visit opens the tab that fits the selected connection.
  if (!active && tab !== null) setTab(null);
  if (active && tab === null && !isLoading) {
    setTab(selected?.kind === "usb" ? "usb" : "wireless");
  }
  return (
    <>
      <ModuleHeader
        icon={Bug}
        title={t("modules.debugging.title")}
        subtitle={t("modules.debugging.subtitle")}
      />
      {/* Hidden modules stay mounted; the tabs must not keep looking for phones then. */}
      {active && tab !== null && (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
            <TabsList
              tabs={TABS.map((value) => ({ value, label: t(`debugging.tabs.${value}`) }))}
            />
            <div className="p-6">
              <TabsContent value="usb">
                <UsbTab onPairNeeded={() => setTab("wireless")} />
              </TabsContent>
              <TabsContent value="wireless">
                <WirelessTab />
              </TabsContent>
              <TabsContent value="settings">
                <PhoneSettingsTab />
              </TabsContent>
              <TabsContent value="pc">
                <PcTab />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </>
  );
}
