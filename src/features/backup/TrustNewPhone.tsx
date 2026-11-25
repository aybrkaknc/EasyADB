import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { useIdle, useJobs } from "../../shared/jobs/store";
import { Button } from "../../shared/ui/Button";
import { Dialog } from "../../shared/ui/Dialog";

/**
 * Asks once per connected phone that has EasyAndroid whether this PC should trust it.
 * A phone that is not trusted yet cannot start backup or file jobs without asking.
 */
export function TrustNewPhone() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const feedback = useFeedback();
  const { devices } = useDevices();
  const idle = useIdle();
  const [ask, setAsk] = useState<{ serial: string; id: string } | null>(null);
  const checked = useRef(new Set<string>());
  // Phones the user put off; they are not asked about again until EasyADB is restarted.
  const later = useRef(new Set<string>());
  const open = ask !== null && idle;

  useEffect(() => {
    useJobs.setState({ trustOpen: ask !== null });
  }, [ask]);

  useEffect(() => {
    const ready = devices.filter((d) => d.state === "device").map((d) => d.serial);
    for (const serial of [...checked.current]) {
      if (!ready.includes(serial)) checked.current.delete(serial);
    }
    const next = ready.find((serial) => !checked.current.has(serial));
    if (!next || ask) return;
    checked.current.add(next);
    void commands
      .newPhoneToTrust(next)
      .then((id) => {
        if (id && !later.current.has(id)) setAsk({ serial: next, id });
      })
      .catch(() => {});
  }, [devices, ask]);

  if (!ask || !open) return null;

  const close = () => {
    later.current.add(ask.id);
    setAsk(null);
  };
  const never = () => {
    close();
    void commands
      .neverAskPhone(ask.id, true)
      .then(() => client.invalidateQueries({ queryKey: ["neverAskPhones"] }))
      .catch(feedback.failure);
  };
  const trust = () => {
    close();
    void commands
      .trustPhone(ask.id)
      .then(() => client.invalidateQueries({ queryKey: ["trustedPhones"] }))
      .catch(feedback.failure);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t("trustPhone.title")}
      footer={
        <>
          <Button variant="ghost" onClick={never}>
            {t("trustPhone.never")}
          </Button>
          <Button variant="ghost" onClick={close}>
            {t("trustPhone.no")}
          </Button>
          <Button onClick={trust}>{t("trustPhone.yes")}</Button>
        </>
      }
    >
      <p className="text-sm">{t("trustPhone.body")}</p>
    </Dialog>
  );
}
