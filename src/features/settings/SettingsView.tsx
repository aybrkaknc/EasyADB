import { Archive, Bug, FileText, Info, Settings as SettingsIcon, Smartphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { SETTINGS_TABS, useAppStore } from "../../app/store";
import { Tabs, TabsContent, TabsList } from "../../shared/ui/Controls";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { SectionNav } from "../../shared/ui/SectionNav";
import { DebuggingTab } from "../debugging/DebuggingTab";
import { LogcatTab } from "../logcat/LogcatView";
import { PerformanceTab } from "../performance/PerformanceView";
import { TerminalTab } from "../terminal/TerminalView";
import {
  AboutSection,
  AppSection,
  BackupSection,
  ConnectionSection,
  DiagnosticsSection,
  PhonesSection,
} from "./Sections";

const SECTIONS = {
  app: [SettingsIcon, AppSection],
  backup: [Archive, BackupSection],
  phones: [Smartphone, PhonesSection],
  connection: [Bug, ConnectionSection],
  diagnostics: [FileText, DiagnosticsSection],
  about: [Info, AboutSection],
} as const;

type SectionId = keyof typeof SECTIONS;

const CONTENT = "flex min-h-0 flex-1 flex-col";
const KEPT = `${CONTENT} data-[state=inactive]:hidden`;

function General() {
  const { t } = useTranslation();
  const active = useAppStore((s) => s.module === "settings");
  const [section, setSection] = useState<SectionId>("app");
  // Every visit starts at the first section.
  if (!active && section !== "app") setSection("app");
  const Section = SECTIONS[section][1];
  return (
    <SectionNav
      label={t("settings.sections.label")}
      sections={(Object.keys(SECTIONS) as SectionId[]).map((id) => ({
        id,
        icon: SECTIONS[id][0],
        label: t(`settings.sections.${id}`),
      }))}
      value={section}
      onChange={setSection}
    >
      <Section />
    </SectionNav>
  );
}

export function SettingsView() {
  const { t } = useTranslation();
  const tab = useAppStore((s) => s.settingsTab);
  const openSettings = useAppStore((s) => s.openSettings);
  // The terminal asks the phone for its apps, so it is only mounted once it has been opened.
  const [terminalOpened, setTerminalOpened] = useState(false);
  if (tab === "terminal" && !terminalOpened) setTerminalOpened(true);
  return (
    <>
      <ModuleHeader icon={SettingsIcon} title={t("modules.settings.title")} />
      <Tabs
        value={tab}
        onValueChange={(value) => openSettings(value as typeof tab)}
        className={CONTENT}
      >
        <TabsList
          tabs={SETTINGS_TABS.map((value) => ({ value, label: t(`settings.tabs.${value}`) }))}
        />
        <TabsContent value="general" className={CONTENT}>
          <General />
        </TabsContent>
        <TabsContent value="debugging" className={CONTENT}>
          <DebuggingTab />
        </TabsContent>
        {/* Kept mounted so that history and a running command or log survive other tabs. */}
        <TabsContent value="terminal" forceMount className={KEPT}>
          {terminalOpened && <TerminalTab />}
        </TabsContent>
        <TabsContent value="performance" className={CONTENT}>
          <PerformanceTab />
        </TabsContent>
        <TabsContent value="logcat" forceMount className={KEPT}>
          <LogcatTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
