import { useQuery } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { Package, Power, Smartphone, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { commands, type DeviceEntry, type RebootMode } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useTask } from "../../shared/hooks/useTask";
import { Button } from "../../shared/ui/Button";
import { DeviceGuard } from "../../shared/ui/DeviceGuard";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { Badge, Spinner, TaskBar } from "../../shared/ui/Feedback";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { ConnectionSummary } from "./ConnectionSummary";
import { KeyValue, Panel } from "../../shared/ui/Panel";

const REBOOT_MODES: RebootMode[] = ["system", "recovery", "bootloader", "sideload", "fastbootd"];

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
  const confirm = useConfirm();
  const feedback = useFeedback();
  const task = useTask();
  const inFastboot = device.state === "bootloader";
  const ready = device.state === "device";

  const reboot = async (mode: RebootMode) => {
    const label = t(`device.reboot.${mode}`);
    if (
      !(await confirm(
        t("device.reboot.confirm", { device: device.model ?? device.serial, mode: label }),
        false,
      ))
    )
      return;
    try {
      await commands.rebootDevice(device.serial, mode, inFastboot);
    } catch (error) {
      feedback.failure(error);
    }
  };

  const installApk = async () => {
    const path = await open({ filters: [{ name: "APK", extensions: ["apk"] }] });
    if (!path) return;
    try {
      await task.run(() => commands.installApk(device.serial, path));
      feedback.success(t("device.install.apkDone"), true);
    } catch (error) {
      feedback.failure(error, true);
    }
  };

  const sideload = async () => {
    const path = await open({ filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (!path) return;
    try {
      await task.run((id) => commands.sideloadZip(id, device.serial, path));
      feedback.success(t("device.install.sideloadDone"), true);
    } catch (error) {
      feedback.failure(error, true);
    }
  };

  const modes = inFastboot ? REBOOT_MODES.filter((m) => m !== "sideload") : REBOOT_MODES;
  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-6 lg:grid-cols-2">
        {ready && (
          <Panel
            title={t("device.info.title")}
            actions={<Badge tone="neon">{t(`devices.kindLong.${device.kind}`)}</Badge>}
          >
            <DeviceInfo device={device} />
          </Panel>
        )}
        <ConnectionSummary device={device} />
        <Panel title={t("device.reboot.title")}>
          <div className="flex flex-wrap gap-2">
            {modes.map((mode) => (
              <Button
                key={mode}
                variant="ghost"
                onClick={() => void reboot(mode)}
                disabled={task.running}
              >
                <Power className="size-3.5" />
                {t(`device.reboot.${mode}`)}
              </Button>
            ))}
          </div>
        </Panel>
        {!inFastboot && (
          <Panel title={t("device.install.title")}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-white/70">{t("device.install.apkHint")}</p>
                <Button onClick={() => void installApk()} disabled={!ready || task.running}>
                  <Package className="size-3.5" />
                  {t("device.install.apk")}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-white/70">{t("device.install.sideloadHint")}</p>
                <Button
                  onClick={() => void sideload()}
                  disabled={device.state !== "sideload" || task.running}
                >
                  <Upload className="size-3.5" />
                  {t("device.install.sideload")}
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>
      {task.running && (
        <TaskBar progress={task.progress} onCancel={task.progress ? task.cancel : undefined} />
      )}
    </>
  );
}

export function DeviceView() {
  const { t } = useTranslation();
  return (
    <>
      <ModuleHeader
        icon={Smartphone}
        title={t("modules.device.title")}
        subtitle={t("modules.device.subtitle")}
      />
      <DeviceGuard allow={["device", "recovery", "sideload", "bootloader"]}>
        {(device) => <DeviceActions key={device.serial} device={device} />}
      </DeviceGuard>
    </>
  );
}
