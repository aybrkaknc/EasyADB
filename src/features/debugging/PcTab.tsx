import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { commands } from "../../bindings";
import { quiet } from "../../shared/hooks/quiet";
import { useConfirm } from "../../shared/hooks/useConfirm";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { Button } from "../../shared/ui/Button";
import { KeyValue, Panel } from "../../shared/ui/Panel";
import { useBusy, useRefresh } from "./shared";

export function PcTab() {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const confirm = useConfirm();
  const refresh = useRefresh();
  const { busy, wrap } = useBusy();
  const info = useQuery({ queryKey: ["adbInfo"], queryFn: () => commands.getAdbInfo() });

  const run = (work: () => Promise<unknown>, done: string) =>
    wrap(async () => {
      quiet("*");
      try {
        await work();
        feedback.success(t(done));
      } catch (error) {
        feedback.failure(error);
      }
      refresh();
      void info.refetch();
    });
  const restart = async () => {
    if (!(await confirm(t("debugging.pc.restartConfirm")))) return;
    await run(() => commands.restartAdbServer(), "debugging.pc.restarted");
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4 text-xs">
      <Panel title="adb">
        <KeyValue
          rows={[
            [t("debugging.pc.version"), info.data?.version],
            [t("debugging.pc.path"), info.data?.path],
            [
              t("debugging.pc.mdns"),
              info.data && t(info.data.mdns ? "debugging.pc.working" : "debugging.pc.notWorking"),
            ],
          ]}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => commands.reconnectOffline(), "debugging.pc.reconnected")}
          >
            {t("debugging.pc.reconnect")}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void restart()}>
            {t("debugging.pc.restart")}
          </Button>
        </div>
        <p className="mt-2 text-white/50">{t("debugging.pc.restartNote")}</p>
      </Panel>
    </div>
  );
}
