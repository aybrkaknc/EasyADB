import { useTranslation } from "react-i18next";

import { commands, type DebugSetting, type DeviceEntry } from "../../bindings";
import { quiet } from "../../shared/hooks/quiet";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { errorText } from "../../shared/lib/errors";
import { phoneKey } from "../../shared/lib/phones";
import { Button } from "../../shared/ui/Button";
import { Switch } from "../../shared/ui/Controls";
import { DeviceGuard } from "../../shared/ui/DeviceGuard";
import { Spinner } from "../../shared/ui/Feedback";
import { Panel } from "../../shared/ui/Panel";
import { useDebugSettings } from "./shared";

type Flag = "wireless" | "auth_expires" | "stay_awake" | "verify_installs";

function Settings({ device }: { device: DeviceEntry }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const feedback = useFeedback();
  const { settings, error, pending, change } = useDebugSettings(device);

  if (!settings) {
    return error ? (
      <p className="text-xs text-danger">{errorText(t, error)}</p>
    ) : (
      <Spinner label={t("common.loading")} />
    );
  }

  const toggle = async (kind: Flag, value: boolean) => {
    if (
      kind === "wireless" &&
      !value &&
      device.kind === "wifi" &&
      !(await confirm(t("debugging.settings.wirelessOffConfirm")))
    ) {
      return;
    }
    await change({ kind, value } as DebugSetting);
  };
  const row = (kind: Flag, current: boolean | null, note?: string) => {
    if (current === null) return null;
    const shown = pending?.kind === kind ? (pending as { value: boolean }).value : current;
    return (
      <div>
        <Switch
          checked={shown}
          onChange={(value) => void toggle(kind, value)}
          label={t(`debugging.settings.${kind}`)}
        />
        {note && <p className="pb-1 text-[11px] text-white/50">{note}</p>}
      </div>
    );
  };
  const revoke = async () => {
    if (!(await confirm(t("debugging.settings.revokeConfirm"), true, true))) return;
    quiet(phoneKey(device));
    try {
      await commands.revokeAuthorizations(device.serial);
      feedback.success(t("debugging.settings.revoked"));
    } catch (error) {
      feedback.failure(error);
    }
  };
  const turnOff = async () => {
    if (!(await confirm(t("debugging.settings.usbOffConfirm"), true, true))) return;
    await change({ kind: "usb_debugging_off" });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4 text-xs">
      <Panel title={t("debugging.settings.connection")}>
        <div className="flex flex-col divide-y divide-white/5">
          {row("wireless", settings.wireless, t("debugging.settings.wirelessNote"))}
          {row("auth_expires", settings.authExpires)}
          {row("stay_awake", settings.stayAwake)}
          {row("verify_installs", settings.verifyInstalls)}
        </div>
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() => void commands.openPhoneSettings(device.serial).catch(feedback.failure)}
        >
          {t("debugging.settings.openOnPhone")}
        </Button>
      </Panel>
      <Panel title={t("debugging.settings.computers")}>
        {settings.computers.length === 0 ? (
          <p className="text-white/50">{t("debugging.settings.noComputers")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {settings.computers.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t("debugging.settings.danger")}>
        <div className="flex flex-col gap-3">
          {settings.canRevoke && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="danger" onClick={() => void revoke()}>
                {t("debugging.settings.revoke")}
              </Button>
              <span className="text-white/60">{t("debugging.settings.revokeNote")}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="danger" onClick={() => void turnOff()}>
              {t("debugging.settings.usbOff")}
            </Button>
            <span className="text-white/60">{t("debugging.settings.usbOffNote")}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function PhoneSettingsTab() {
  return <DeviceGuard>{(device) => <Settings key={device.serial} device={device} />}</DeviceGuard>;
}
