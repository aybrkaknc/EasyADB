import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";
import { runJob } from "../../shared/jobs/store";
import { Button } from "../../shared/ui/Button";

/** Measures the connection to the selected phone, wireless or not. */
export function SpeedTest() {
  const { t } = useTranslation();
  const { selected } = useDevices();
  const ready = selected?.state === "device" ? selected : null;
  const start = () => {
    if (!ready) return;
    void runJob({
      kind: "speed",
      serial: ready.serial,
      device: `${ready.model ?? ready.serial} - ${t(`speed.link.${ready.kind}`)}`,
      items: [],
      run: ({ taskId }) => commands.startSpeedTest(taskId, ready.serial),
      speed: (speed) => speed,
    });
  };
  return (
    <>
      <p className="label mb-1">{t("speed.title")}</p>
      <p className="mb-3 text-xs text-white/60">{t("speed.intro")}</p>
      <Button onClick={start} disabled={!ready}>
        {t("speed.start")}
      </Button>
    </>
  );
}
