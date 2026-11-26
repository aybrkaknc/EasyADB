import { Link2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type WirelessPhone_Serialize as WirelessPhone } from "../../bindings";
import { quiet } from "../../shared/hooks/quiet";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { Button } from "../../shared/ui/Button";
import { Field, FilterChips, Input } from "../../shared/ui/Controls";
import { Badge } from "../../shared/ui/Feedback";
import { Panel } from "../../shared/ui/Panel";
import { QrPairing } from "./QrPairing";
import { ADDRESS, useBusy, useDiscovery, useRefresh } from "./shared";

const nameOf = (phone: WirelessPhone) => phone.model ?? phone.name ?? phone.key;

function Phones({ phones }: { phones: WirelessPhone[] }) {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const confirm = useConfirm();
  const refresh = useRefresh();
  const { busy, wrap } = useBusy();

  const connect = (phone: WirelessPhone) =>
    wrap(async () => {
      quiet(phone.key);
      let failure: unknown = null;
      // A phone may announce an old port next to the current one, so each is tried.
      for (const address of phone.addresses) {
        try {
          await commands.wirelessConnect(address);
          feedback.success(t("debugging.wireless.connectedTo", { name: nameOf(phone) }));
          failure = null;
          break;
        } catch (error) {
          failure = error;
        }
      }
      if (failure) feedback.failure(failure);
      refresh();
    });
  const forget = (phone: WirelessPhone) =>
    wrap(async () => {
      if (!(await confirm(t("debugging.wireless.forgetConfirm", { name: nameOf(phone) })))) return;
      quiet(phone.key);
      try {
        await commands.wirelessForget(phone.key);
      } catch (error) {
        feedback.failure(error);
      }
      refresh();
    });

  return (
    <Panel title={t("debugging.wireless.phones")}>
      {phones.length === 0 ? (
        <p className="text-xs text-white/50">{t("debugging.wireless.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/5">
          {phones.map((phone) => {
            const connected = phone.connected.length > 0;
            // A phone saved by address alone never announces itself, so it can always be tried.
            const reachable = phone.online || (phone.name === null && phone.addresses.length > 0);
            const state = connected ? "connected" : phone.online ? "online" : "away";
            return (
              <li key={phone.key} className="flex flex-wrap items-center gap-3 py-2 text-xs">
                <span className="min-w-0 truncate">{nameOf(phone)}</span>
                <span className="text-white/50">{phone.addresses[0]?.split(":")[0] ?? "-"}</span>
                <Badge tone={connected ? "neon" : phone.online ? "warn" : "muted"}>
                  {t(`debugging.wireless.state.${state}`)}
                </Badge>
                <div className="ml-auto flex gap-2">
                  {!connected && reachable && (
                    <Button size="sm" disabled={busy} onClick={() => void connect(phone)}>
                      <Link2 className="size-3" />
                      {t("debugging.wireless.connect")}
                    </Button>
                  )}
                  {(phone.saved || connected) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void forget(phone)}
                    >
                      <X className="size-3" />
                      {t("debugging.wireless.forget")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function CodeForm({ found }: { found: string | null }) {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const refresh = useRefresh();
  const { busy, wrap } = useBusy();
  // `null` follows the address the phone announces.
  const [typed, setTyped] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const address = typed ?? found ?? "";
  const pair = () =>
    wrap(async () => {
      quiet("*");
      try {
        const connected = await commands.wirelessPair(address.trim(), code.trim());
        feedback.success(t(connected ? "debugging.code.connected" : "debugging.code.paired"));
        setCode("");
        setTyped(null);
      } catch (error) {
        feedback.failure(error);
      }
      refresh();
    });
  return (
    <div className="flex max-w-md flex-col gap-4">
      <p className="text-xs text-white/80">{t("debugging.code.intro")}</p>
      <Field label={t("debugging.code.address")}>
        <Input
          value={address}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="192.168.1.23:37000"
        />
      </Field>
      <Field label={t("debugging.code.code")}>
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
        {t("debugging.code.pair")}
      </Button>
    </div>
  );
}

function IpForm() {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const refresh = useRefresh();
  const { busy, wrap } = useBusy();
  const [address, setAddress] = useState("");
  const connect = () =>
    wrap(async () => {
      quiet("*");
      try {
        await commands.wirelessConnect(address.trim());
        feedback.success(t("debugging.ip.done", { address: address.trim() }));
      } catch (error) {
        feedback.failure(error);
      }
      refresh();
    });
  return (
    <div className="flex max-w-md flex-col gap-4">
      <p className="text-xs text-white/80">{t("debugging.ip.intro")}</p>
      <Field label={t("debugging.ip.address")}>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="192.168.1.23:5555"
        />
      </Field>
      <Button onClick={() => void connect()} disabled={busy || !ADDRESS.test(address.trim())}>
        {t("debugging.ip.connect")}
      </Button>
    </div>
  );
}

const WAYS = ["qr", "code", "ip"] as const;

export function WirelessTab() {
  const { t } = useTranslation();
  const discovery = useDiscovery();
  const phones = discovery.data?.phones ?? [];
  const [way, setWay] = useState<(typeof WAYS)[number]>("qr");
  const [forced, setForced] = useState(false);
  // Decided by the first answer, so that the code stays while a phone connects to it.
  const [initial, setInitial] = useState<string | null>(null);
  if (discovery.data && initial === null) {
    const connected = discovery.data.phones.find((p) => p.connected.length > 0);
    setInitial(connected ? nameOf(connected) : "");
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Phones phones={phones} />
      <Panel title={t("debugging.wireless.pairNew")}>
        <div className="mb-4">
          <FilterChips
            value={way}
            options={WAYS.map((value) => ({ value, label: t(`debugging.wireless.way.${value}`) }))}
            onChange={setWay}
          />
        </div>
        {way === "qr" &&
          (initial === null ? null : initial && !forced ? (
            <div className="flex flex-col items-start gap-3 text-xs">
              <p className="text-white/80">{t("debugging.qr.already", { name: initial })}</p>
              <Button size="sm" onClick={() => setForced(true)}>
                {t("debugging.qr.show")}
              </Button>
            </div>
          ) : (
            <QrPairing />
          ))}
        {way === "code" && <CodeForm found={discovery.data?.codePairing ?? null} />}
        {way === "ip" && <IpForm />}
      </Panel>
    </div>
  );
}
