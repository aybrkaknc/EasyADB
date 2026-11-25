import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { commands, type Decision, events, type PhoneRequestAsk } from "../../bindings";
import { useFeedback } from "../../shared/hooks/useFeedback";
import { appName } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { Dialog } from "../../shared/ui/Dialog";

/**
 * Jobs that the phone asks of this PC: asks the user the first time a phone does, and tells
 * the user how a job ended. A trusted phone's jobs start without asking.
 */
export function PhoneRequests() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const feedback = useFeedback();
  const [queue, setQueue] = useState<PhoneRequestAsk[]>([]);
  const latest = useRef({ t, feedback, client });
  useEffect(() => {
    latest.current = { t, feedback, client };
  });

  useEffect(() => {
    const asks = events.phoneRequestAsk.listen((event) => {
      const ask = event.payload;
      setQueue((list) =>
        list.some((a) => a.phone === ask.phone && a.id === ask.id) ? list : [...list, ask],
      );
    });
    const jobs = events.phoneJobEvent.listen((event) => {
      const job = event.payload;
      const { t, feedback, client } = latest.current;
      if (job.state === "running") return;
      // The request has been answered, whatever the answer was.
      setQueue((list) => list.filter((a) => !(a.phone === job.phone && a.id === job.id)));
      if (job.state === "done") {
        const what =
          job.kind === "app"
            ? appName({ package: job.package })
            : t(job.kind === "folders" ? "phoneRequest.whatFolders" : "phoneRequest.whatPull");
        feedback.success(t("phoneRequest.done", { what }), true);
      } else {
        feedback.failure(job.error ?? { code: "cancelled", detail: "" }, true);
      }
      for (const key of ["backups", "fileSets", "systemBackups"]) {
        void client.invalidateQueries({ queryKey: [key] });
      }
      void client.invalidateQueries({ queryKey: ["phoneBackups"] });
    });
    return () => {
      void asks.then((off) => off());
      void jobs.then((off) => off());
    };
  }, []);

  const ask = queue[0];
  if (!ask) return null;

  const answer = (decision: Decision) => {
    setQueue((list) => list.slice(1));
    void commands.answerPhoneRequest(ask.phone, ask.id, decision).catch(feedback.failure);
  };
  const body =
    ask.kind === "app"
      ? t("phoneRequest.appBody", { name: appName({ package: ask.package }) })
      : ask.kind === "folders"
        ? t("phoneRequest.foldersBody", { count: ask.count })
        : t("phoneRequest.pullBody", { count: ask.count });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && answer("reject")}
      title={t("phoneRequest.title", { model: ask.model || ask.phone })}
      footer={
        <>
          <Button variant="ghost" onClick={() => answer("reject")}>
            {t("phoneRequest.reject")}
          </Button>
          <Button variant="ghost" onClick={() => answer("once")}>
            {t("phoneRequest.once")}
          </Button>
          <Button onClick={() => answer("trust")}>{t("phoneRequest.trust")}</Button>
        </>
      }
    >
      <p className="text-sm">{body}</p>
      <p className="text-white/60">{t("phoneRequest.trustHint")}</p>
    </Dialog>
  );
}
