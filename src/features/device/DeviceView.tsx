import { useQuery } from "@tanstack/react-query";
import { Archive, Eraser, FolderOpen, Settings, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../../app/store";
import { commands, type DeviceEntry } from "../../bindings";
import { Button } from "../../shared/ui/Button";
import { DeviceGuard } from "../../shared/ui/DeviceGuard";
import { Badge, Spinner } from "../../shared/ui/Feedback";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { KeyValue, Panel, PlainPanels } from "../../shared/ui/Panel";

function DeviceInfo({ device }: { device: DeviceEntry }) {
  const { t } = useTranslation();
  const details = useQuery({
    queryKey: ["details", device.serial],
    queryFn: () => commands.getDeviceDetails(device.serial),
  });
  const d = details.data;
  if (details.isLoading) return <Spinner label={t("common.loading")} />;
  if (!d) return null;
  const locked =
    d.bootloaderLocked === null
      ? t("common.unknown")
      : t(d.bootloaderLocked ? "device.info.locked" : "device.info.unlocked");
  return (
    <KeyValue
      rows={[
        [t("device.info.model"), d.model],
        [t("device.info.manufacturer"), d.manufacturer],
        [t("device.info.android"), `${d.androidVersion} (SDK ${d.sdk})`],
        [t("device.info.build"), d.build],
        [t("device.info.abi"), d.abi],
        [t("device.info.root"), t(d.hasSu ? "device.info.found" : "device.info.notFound")],
        [
          t("device.info.easyAndroid"),
          t(d.easyAndroid ? "device.info.installed" : "device.info.notInstalled"),
        ],
        [t("device.info.bootloader"), locked],
        [t("device.info.verifiedBoot"), d.verifiedBoot],
        [t("device.info.selinux"), d.selinux],
      ]}
    />
  );
}

function DeviceActions({ device }: { device: DeviceEntry }) {
  const { t } = useTranslation();
  const setModule = useAppStore((s) => s.setModule);
  const tiles = [
    { icon: Archive, label: t("device.quick.backup"), go: () => setModule("backup") },
    { icon: Eraser, label: t("device.quick.debloat"), go: () => setModule("debloat") },
    { icon: FolderOpen, label: t("device.quick.files"), go: () => setModule("files") },
    { icon: Settings, label: t("device.quick.settings"), go: () => setModule("settings") },
  ];
  return (
    <PlainPanels>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6">
        {device.state === "device" && (
          <Panel
            title={t("device.info.title")}
            actions={<Badge tone="neon">{t(`devices.kindLong.${device.kind}`)}</Badge>}
          >
            <DeviceInfo device={device} />
          </Panel>
        )}
        <Panel title={t("device.quick.title")}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {tiles.map(({ icon: Icon, label, go }) => (
              <Button key={label} variant="ghost" onClick={go} className="h-auto flex-col py-4">
                <Icon className="size-5" />
                {label}
              </Button>
            ))}
          </div>
        </Panel>
      </div>
    </PlainPanels>
  );
}

export function DeviceView() {
  const { t } = useTranslation();
  return (
    <>
      <ModuleHeader icon={Smartphone} title={t("modules.device.title")} />
      <DeviceGuard allow={["device", "recovery", "sideload", "bootloader"]}>
        {(device) => <DeviceActions key={device.serial} device={device} />}
      </DeviceGuard>
    </>
  );
}
