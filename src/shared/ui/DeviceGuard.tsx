import { AlertTriangle, PlugZap, ShieldQuestion, Unplug } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../../app/store";
import type { DeviceEntry, DeviceState } from "../../bindings";
import { useDevices } from "../hooks/useDevices";
import { isAppError } from "../lib/errors";
import { Button } from "./Button";
import { Panel } from "./Panel";

function Guide({ icon: Icon, guide, steps }: { icon: LucideIcon; guide: string; steps: number }) {
  const { t } = useTranslation();
  const openSettings = useAppStore((s) => s.openSettings);
  const here = useAppStore((s) => s.module === "settings" && s.settingsTab === "debugging");
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Panel className="w-full max-w-xl">
        <div className="mb-4 flex items-center gap-3">
          <Icon className="size-6 text-warn" aria-hidden />
          <h2 className="heading text-lg">{t(`guide.${guide}.title`)}</h2>
        </div>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-xs text-white/80">
          {Array.from({ length: steps }, (_, i) => (
            <li key={i}>{t(`guide.${guide}.step${i + 1}`)}</li>
          ))}
        </ol>
        {guide !== "adbMissing" && !here && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <p className="label text-neon/70">{t("guide.wireless")}</p>
            <Button size="sm" onClick={() => openSettings("debugging")}>
              {t("debugging.open")}
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

/**
 * Renders `children` only when a device in one of the `allow` states is selected;
 * otherwise shows step-by-step help for the current situation.
 */
export function DeviceGuard({
  allow = ["device"],
  children,
}: {
  allow?: DeviceState[];
  children: (device: DeviceEntry) => ReactNode;
}) {
  const { t } = useTranslation();
  const { selected, error } = useDevices();

  if (isAppError(error) && error.code === "adb_missing") {
    return <Guide icon={AlertTriangle} guide="adbMissing" steps={1} />;
  }
  if (!selected) return <Guide icon={Unplug} guide="noDevice" steps={4} />;
  if (selected.state === "unauthorized")
    return <Guide icon={ShieldQuestion} guide="unauthorized" steps={3} />;
  if (selected.state === "offline") return <Guide icon={PlugZap} guide="offline" steps={3} />;
  if (!allow.includes(selected.state)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Panel className="max-w-xl text-xs">
          {t("guide.wrongMode", { state: t(`devices.state.${selected.state}`) })}
        </Panel>
      </div>
    );
  }
  return <>{children(selected)}</>;
}
