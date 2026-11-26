import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { quiet } from "../../shared/hooks/quiet";
import { useDevices } from "../../shared/hooks/useDevices";
import { errorText } from "../../shared/lib/errors";
import { phoneKey } from "../../shared/lib/phones";
import { Button } from "../../shared/ui/Button";
import { Spinner } from "../../shared/ui/Feedback";

/** How long one code waits for a phone before the next one replaces it. */
const LIFETIME_S = 90;

type Phase =
  | { kind: "waiting" }
  | { kind: "pairing" }
  | { kind: "paired"; connected: boolean }
  | { kind: "error"; text: string };

export function QrPairing() {
  const { t } = useTranslation();
  const { devices } = useDevices();
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "waiting" });
  const [left, setLeft] = useState(LIFETIME_S);
  const qr = useQuery({
    queryKey: ["qr", round],
    queryFn: () => commands.wirelessNewQr(),
    staleTime: Infinity,
    gcTime: 0,
  });
  // Phones that were connected without a cable before this screen opened.
  const wireless = devices.filter((d) => d.kind === "wifi" && d.state === "device");
  const [before] = useState(() => new Set(wireless.map(phoneKey)));
  const arrived = wireless.find((d) => !before.has(phoneKey(d)));

  const renew = () => {
    setPhase({ kind: "waiting" });
    setLeft(LIFETIME_S);
    setRound((r) => r + 1);
  };
  const waiting = phase.kind === "waiting" && !arrived;

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  if (waiting && left <= 0) renew();

  useEffect(() => {
    const code = qr.data;
    if (!code) return;
    let stopped = false;
    const poll = async () => {
      while (!stopped) {
        try {
          const address = await commands.wirelessFindPairing(code.name);
          if (stopped) return;
          if (address) {
            setPhase({ kind: "pairing" });
            // The pairing outlives this code, so its end is shown even after a re-render.
            quiet("*");
            const connected = await commands.wirelessPair(address, code.password);
            setPhase({ kind: "paired", connected });
            return;
          }
        } catch (error) {
          setPhase({ kind: "error", text: errorText(t, error) });
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, [qr.data, t]);

  const name = arrived && (arrived.model ?? arrived.serial);
  return (
    <div className="flex flex-col items-start gap-3 text-xs">
      <p className="text-white/80">{t("debugging.qr.intro")}</p>
      <div className="bg-white p-3">
        {qr.data ? (
          <QRCodeSVG value={qr.data.qrText} size={180} />
        ) : (
          <div className="size-[180px]" />
        )}
      </div>
      {name ? (
        <p className="text-neon">{t("debugging.qr.connected", { name })}</p>
      ) : (
        <>
          {phase.kind === "waiting" && (
            <>
              <Spinner label={t("debugging.qr.waiting")} />
              <p className="label">{t("debugging.qr.next", { seconds: left })}</p>
            </>
          )}
          {phase.kind === "pairing" && <Spinner label={t("debugging.qr.pairing")} />}
          {phase.kind === "paired" &&
            (phase.connected ? (
              <Spinner label={t("debugging.qr.connecting")} />
            ) : (
              <p className="text-warn">{t("debugging.qr.notConnected")}</p>
            ))}
          {phase.kind === "error" && <p className="text-danger">{phase.text}</p>}
        </>
      )}
      <Button variant="ghost" size="sm" onClick={renew} disabled={phase.kind === "pairing"}>
        {t("debugging.qr.renew")}
      </Button>
      <p className="text-white/40">{t("debugging.qr.note")}</p>
    </div>
  );
}
