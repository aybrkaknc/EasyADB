import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Unlink, Wifi, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { Button } from "../../shared/ui/Button";
import { Field, Input, Tabs, TabsContent, TabsList } from "../../shared/ui/Controls";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { Panel } from "../../shared/ui/Panel";
import { QrPairing } from "./QrPairing";

const ADDRESS = /^[A-Za-z0-9.-]+:\d{1,5}$/;

function useBusy() {
  const [busy, setBusy] = useState(false);
  const wrap = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };
  return { busy, wrap };
}

function CodeTab() {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const { busy, wrap } = useBusy();
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const pair = () =>
    wrap(async () => {
      try {
        await commands.wirelessPair(address.trim(), code.trim());
        feedback.success(t("wireless.code.paired"));
      } catch (error) {
        feedback.failure(error);
      }
    });
  return (
    <div className="flex max-w-md flex-col gap-4">
      <p className="text-xs text-white/80">{t("wireless.code.intro")}</p>
      <Field label={t("wireless.code.address")}>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="192.168.1.23:37000"
        />
      </Field>
      <Field label={t("wireless.code.code")}>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          inputMode="numeric"
        />
      </Field>
      <Button
        onClick={() => void pair()}
        disabled={busy || !ADDRESS.test(address.trim()) || !code.trim()}
      >
        {t("wireless.code.pair")}
      </Button>
    </div>
  );
}

function IpTab({ onConnected }: { onConnected: () => void }) {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const { busy, wrap } = useBusy();
  const [address, setAddress] = useState("");
  const connect = () =>
    wrap(async () => {
      try {
        await commands.wirelessConnect(address.trim());
        feedback.success(t("wireless.ip.done", { address: address.trim() }));
        onConnected();
      } catch (error) {
        feedback.failure(error);
      }
    });
  return (
    <div className="flex max-w-md flex-col gap-4">
      <p className="text-xs text-white/80">{t("wireless.ip.intro")}</p>
      <Field label={t("wireless.ip.address")}>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="192.168.1.23:5555"
        />
      </Field>
      <Button onClick={() => void connect()} disabled={busy || !ADDRESS.test(address.trim())}>
        {t("wireless.ip.connect")}
      </Button>
    </div>
  );
}

function UsbTab({ onConnected }: { onConnected: () => void }) {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const { busy, wrap } = useBusy();
  const { selected } = useDevices();
  const usb = selected?.kind === "usb" && selected.state === "device" ? selected : null;
  const enable = () =>
    wrap(async () => {
      if (!usb) return;
      try {
        const address = await commands.wirelessEnableTcpip(usb.serial);
        feedback.success(t("wireless.usb.done", { address }));
        onConnected();
      } catch (error) {
        feedback.failure(error);
      }
    });
  return (
    <div className="flex max-w-md flex-col gap-4 text-xs">
      <p className="text-white/80">{t("wireless.usb.intro")}</p>
      {!usb && <p className="text-warn">{t("wireless.usb.needUsb")}</p>}
      <Button onClick={() => void enable()} disabled={busy || !usb}>
        {t("wireless.usb.enable")}
      </Button>
    </div>
  );
}

function SavedDevices() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const feedback = useFeedback();
  const saved = useQuery({ queryKey: ["wirelessSaved"], queryFn: () => commands.wirelessSaved() });
  const refresh = () => void client.invalidateQueries({ queryKey: ["wirelessSaved"] });
  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      feedback.failure(error);
    }
    refresh();
  };
  return (
    <Panel title={t("wireless.saved.title")}>
      {!saved.data?.length ? (
        <p className="text-xs text-white/50">{t("wireless.saved.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {saved.data.map((device) => (
            <li key={device.address} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate">{device.address}</span>
              <Button
                size="sm"
                onClick={() => void act(() => commands.wirelessConnect(device.address))}
                aria-label={t("wireless.saved.reconnect")}
              >
                <Link2 className="size-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void act(() => commands.wirelessDisconnect(device.address))}
                aria-label={t("wireless.saved.disconnect")}
              >
                <Unlink className="size-3" />
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void act(() => commands.wirelessForget(device.address))}
                aria-label={t("wireless.saved.forget")}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function WirelessView() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [tab, setTab] = useState("code");
  const connected = () => {
    void client.invalidateQueries({ queryKey: ["wirelessSaved"] });
    void client.invalidateQueries({ queryKey: ["devices"] });
  };
  return (
    <>
      <ModuleHeader
        icon={Wifi}
        title={t("modules.wireless.title")}
        subtitle={t("modules.wireless.subtitle")}
      />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList
          tabs={(["code", "qr", "ip", "usb"] as const).map((v) => ({
            value: v,
            label: t(`wireless.tabs.${v}`),
          }))}
        />
        <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-6">
          <div className="min-w-0 flex-1">
            <TabsContent value="code">
              <CodeTab />
            </TabsContent>
            <TabsContent value="qr">{tab === "qr" && <QrPairing />}</TabsContent>
            <TabsContent value="ip">
              <IpTab onConnected={connected} />
            </TabsContent>
            <TabsContent value="usb">
              <UsbTab onConnected={connected} />
            </TabsContent>
          </div>
          <div className="w-80 shrink-0">
            <SavedDevices />
          </div>
        </div>
      </Tabs>
    </>
  );
}
