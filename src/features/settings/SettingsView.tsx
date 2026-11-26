import { Archive, Bug, FileText, Info, Settings as SettingsIcon, Smartphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../../app/store";
import { cn } from "../../shared/lib/cn";
import { Tabs, TabsContent, TabsList } from "../../shared/ui/Controls";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { LogcatTab } from "../logcat/LogcatView";
import { PerformanceTab } from "../performance/PerformanceView";
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

function General() {
  const { t } = useTranslation();
  const active = useAppStore((s) => s.module === "settings");
  const [section, setSection] = useState<SectionId>("app");
  // Every visit starts at the first section.
  if (!active && section !== "app") setSection("app");
  const Section = SECTIONS[section][1];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6 lg:flex-row lg:items-start">
      <nav
        aria-label={t("settings.sections.label")}
        className="flex shrink-0 flex-row flex-wrap gap-1 lg:w-44 lg:flex-col"
      >
        {(Object.keys(SECTIONS) as SectionId[]).map((id) => {
          const Icon = SECTIONS[id][0];
          const selected = id === section;
          return (
            <button
              key={id}
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => setSection(id)}
              className={cn(
                "flex items-center gap-2 border px-3 py-2 text-left text-[11px] tracking-widest uppercase transition-colors",
                selected
                  ? "border-neon bg-neon/15 text-neon"
                  : "border-white/15 text-white/60 hover:text-white",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {t(`settings.sections.${id}`)}
            </button>
          );
        })}
      </nav>
      <div className="w-full max-w-3xl min-w-0">
        <Section />
      </div>
    </div>
  );
}

export function SettingsView() {
  const { t } = useTranslation();
  const active = useAppStore((s) => s.module === "settings");
  const [tab, setTab] = useState("general");
  // Every visit starts at the general settings.
  if (!active && tab !== "general") setTab("general");
  return (
    <>
      <ModuleHeader
        icon={SettingsIcon}
        title={t("modules.settings.title")}
        subtitle={t("modules.settings.subtitle")}
      />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList
          tabs={(["general", "performance", "logcat"] as const).map((value) => ({
            value,
            label: t(`settings.tabs.${value}`),
          }))}
        />
        <TabsContent value="general" className="flex min-h-0 flex-1 flex-col">
          <General />
        </TabsContent>
        <TabsContent value="performance" className="flex min-h-0 flex-1 flex-col">
          <PerformanceTab />
        </TabsContent>
        {/* Kept mounted so that a running log goes on while another tab is open. */}
        <TabsContent
          value="logcat"
          forceMount
          className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          <LogcatTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
