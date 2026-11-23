import { useTranslation } from "react-i18next";

import type { DebloatApp } from "../../bindings";
import { Badge } from "../../shared/ui/Feedback";
import { appName } from "../../shared/lib/format";
import { REMOVAL_TONE, statusKey } from "./debloat";

export function DebloatDetails({ item }: { item: DebloatApp | null }) {
  const { t } = useTranslation();
  if (!item) return <p className="label p-4">{t("debloat.noInfo")}</p>;
  const { app, info } = item;
  return (
    <div className="flex flex-col gap-3 p-4 text-xs">
      <div>
        <p className="text-sm text-white">{appName(app)}</p>
        <p className="break-all text-[10px] text-white/40">{app.package}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {info ? (
          <Badge tone={REMOVAL_TONE[info.removal]}>{t(`debloat.removal.${info.removal}`)}</Badge>
        ) : (
          <Badge>{t("debloat.removal.unknown")}</Badge>
        )}
        <Badge>{t(`debloat.status.${statusKey(app)}`)}</Badge>
        {info && <Badge>{`${t("debloat.list")}: ${info.list}`}</Badge>}
      </div>
      <p className="whitespace-pre-wrap text-white/80">
        {info?.description || t("debloat.noInfo")}
      </p>
      {info && info.neededBy.length > 0 && (
        <div>
          <p className="label mb-1">{t("debloat.neededBy")}</p>
          <ul className="text-[11px] break-all text-warn/90">
            {info.neededBy.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {info && info.dependencies.length > 0 && (
        <div>
          <p className="label mb-1">{t("debloat.dependencies")}</p>
          <ul className="text-[11px] break-all text-white/60">
            {info.dependencies.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="label mt-2 normal-case tracking-normal text-white/30">{t("debloat.source")}</p>
    </div>
  );
}
