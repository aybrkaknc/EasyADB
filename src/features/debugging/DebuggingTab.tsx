import { Bug, Monitor, Smartphone, Usb } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useDevices } from "../../shared/hooks/useDevices";
import { SectionNav } from "../../shared/ui/SectionNav";
import { PcTab } from "./PcTab";
import { PhoneSettingsTab } from "./PhoneSettingsTab";
import { UsbTab } from "./UsbTab";
import { WirelessTab } from "./WirelessTab";

const ICONS = { usb: Usb, wireless: Bug, settings: Smartphone, pc: Monitor };

type SectionId = keyof typeof ICONS;

/** Mounted only while its tab is shown, so nothing keeps looking for phones in the background. */
export function DebuggingTab() {
  const { t } = useTranslation();
  const { selected, isLoading } = useDevices();
  const [section, setSection] = useState<SectionId | null>(null);
  // Each visit opens the section that fits the selected connection.
  if (section === null && !isLoading) {
    setSection(selected?.kind === "usb" ? "usb" : "wireless");
  }
  if (section === null) return null;
  return (
    <SectionNav
      label={t("debugging.sections.label")}
      sections={(Object.keys(ICONS) as SectionId[]).map((id) => ({
        id,
        icon: ICONS[id],
        label: t(`debugging.tabs.${id}`),
      }))}
      value={section}
      onChange={setSection}
    >
      {section === "usb" && <UsbTab onPairNeeded={() => setSection("wireless")} />}
      {section === "wireless" && <WirelessTab />}
      {section === "settings" && <PhoneSettingsTab />}
      {section === "pc" && <PcTab />}
    </SectionNav>
  );
}
