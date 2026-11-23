import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { errorText } from "../../shared/lib/errors";
import { Button } from "../../shared/ui/Button";
import { Spinner } from "../../shared/ui/Feedback";

const TIMEOUT_MS = 90_000;

type Phase =
  | { kind: "waiting" }
  | { kind: "pairing" }
  | { kind: "done" }
  | { kind: "timeout" }
  | { kind: "error"; text: string };

export function QrPairing() {
  const { t } = useTranslation();
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "waiting" });
  const qr = useQuery({
    queryKey: ["qr", round],
    queryFn: () => commands.wirelessNewQr(),
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    const code = qr.data;
    if (!code) return;
    let stopped = false;
    const deadline = Date.now() + TIMEOUT_MS;
    const poll = async () => {
      while (!stopped && Date.now() < deadline) {
        try {
          const address = await commands.wirelessFindPairing(code.name);
          if (stopped) return;
          if (address) {
            setPhase({ kind: "pairing" });
            await commands.wirelessPair(address, code.password);
            if (!stopped) setPhase({ kind: "done" });
            return;
          }
        } catch (error) {
          if (!stopped) setPhase({ kind: "error", text: errorText(t, error) });
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!stopped) setPhase({ kind: "timeout" });
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, [qr.data, t]);

  return (
    <div className="flex flex-col items-start gap-4 text-xs">
      <p className="text-white/80">{t("wireless.qr.intro")}</p>
      <div className="bg-white p-3">
        {qr.data ? (
          <QRCodeSVG value={qr.data.qrText} size={180} />
        ) : (
          <div className="size-[180px]" />
        )}
      </div>
      {phase.kind === "waiting" && <Spinner label={t("wireless.qr.waiting")} />}
      {phase.kind === "pairing" && <Spinner label={t("wireless.qr.pairing")} />}
      {phase.kind === "done" && <p className="text-neon">{t("wireless.qr.done")}</p>}
      {phase.kind === "timeout" && <p className="text-warn">{t("wireless.qr.timeout")}</p>}
      {phase.kind === "error" && <p className="text-danger">{phase.text}</p>}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setPhase({ kind: "waiting" });
          setRound((r) => r + 1);
        }}
      >
        {t("wireless.qr.renew")}
      </Button>
      <p className="label normal-case tracking-normal text-white/40">{t("wireless.qr.note")}</p>
    </div>
  );
}
