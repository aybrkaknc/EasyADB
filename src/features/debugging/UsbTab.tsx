import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type UsbMode } from "../../bindings";
import { quiet } from "../../shared/hooks/quiet";
import { useDevices } from "../../shared/hooks/useDevices";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { phoneKey } from "../../shared/lib/phones";
import { Button } from "../../shared/ui/Button";
import { Field, FilterChips, Input } from "../../shared/ui/Controls";
import { Panel } from "../../shared/ui/Panel";
import { useBusy, useDebugSettings, useRefresh } from "./shared";

const MODES: UsbMode[] = ["charging", "mtp", "ptp", "rndis", "midi"];

export function UsbTab({ onPairNeeded }: { onPairNeeded: () => void }) {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const refresh = useRefresh();
  const { busy, wrap } = useBusy();
  const { devices, selected } = useDevices();
  const [port, setPort] = useState("5555");
  const cabled = devices.filter((d) => d.kind === "usb" && d.state === "device");
  const usb = cabled.find((d) => d.serial === selected?.serial) ?? cabled[0] ?? null;
  const { settings, pending, change } = useDebugSettings(usb);
  const number = Number(port);
  const validPort = Number.isInteger(number) && number >= 1024 && number <= 65535;
  const mode = pending?.kind === "usb_mode" ? pending.value : settings?.usbMode;

  const wireless = () =>
    wrap(async () => {
      if (!usb) return;
      quiet(phoneKey(usb));
      try {
        if (await commands.wirelessConnectUsb(usb.serial)) {
          feedback.success(t("debugging.usb.wirelessDone"));
        } else {
          feedback.warning(t("debugging.usb.wirelessPair"));
          onPairNeeded();
        }
      } catch (error) {
        feedback.failure(error);
      }
      refresh();
    });
  const tcp = () =>
    wrap(async () => {
      if (!usb) return;
      quiet(phoneKey(usb));
      try {
        const address = await commands.wirelessEnableTcpip(usb.serial, number);
        feedback.success(t("debugging.usb.tcpDone", { address }));
      } catch (error) {
        feedback.failure(error);
      }
      refresh();
    });

  return (
    <div className="flex max-w-3xl flex-col gap-4 text-xs">
      <Panel title={t("debugging.usb.cable")}>
        {usb ? (
          <p className="text-neon">
            {t("debugging.usb.plugged", { name: usb.model ?? usb.serial })}
          </p>
        ) : (
          <>
            <p className="mb-2 text-warn">{t("debugging.usb.none")}</p>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-white/80">
              {[1, 2, 3, 4].map((step) => (
                <li key={step}>{t(`guide.noDevice.step${step}`)}</li>
              ))}
            </ol>
          </>
        )}
      </Panel>
      {usb && mode && (
        <Panel title={t("debugging.usb.mode")}>
          <FilterChips
            value={mode}
            options={MODES.map((value) => ({ value, label: t(`debugging.usb.modes.${value}`) }))}
            onChange={(value) => void change({ kind: "usb_mode", value })}
          />
          <p className="mt-2 text-white/50">{t("debugging.usb.modeNote")}</p>
        </Panel>
      )}
      <Panel title={t("debugging.usb.toWireless")}>
        <div className="flex flex-col items-start gap-3">
          <p className="text-white/80">{t("debugging.usb.toWirelessIntro")}</p>
          {settings?.wireless !== null && (
            <Button onClick={() => void wireless()} disabled={busy || !usb}>
              {t("debugging.usb.enableWireless")}
            </Button>
          )}
          <p className="text-white/80">{t("debugging.usb.tcpIntro")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Field label={t("debugging.usb.port")}>
                <Input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
              </Field>
            </div>
            <Button onClick={() => void tcp()} disabled={busy || !usb || !validPort}>
              {t("debugging.usb.tcpOn")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void change({ kind: "tcp_off" })}
              disabled={busy || !settings?.tcpPort}
            >
              {t("debugging.usb.tcpOff")}
            </Button>
          </div>
          <p className="text-white/50">{t("debugging.usb.tcpNote")}</p>
        </div>
      </Panel>
    </div>
  );
}
