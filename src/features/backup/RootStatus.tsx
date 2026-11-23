import { useTranslation } from "react-i18next";

import type { useRoot } from "../../shared/hooks/useRoot";
import { Button } from "../../shared/ui/Button";

/** Explains whether app data can be copied, and lets the user ask for root again. */
export function RootStatus({ root }: { root: ReturnType<typeof useRoot> }) {
  const { t } = useTranslation();
  if (root.checking)
    return <p className="text-[11px] text-white/60">{t("backup.root.checking")}</p>;
  if (root.isRoot) return <p className="text-[11px] text-neon/80">{t("backup.root.available")}</p>;
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-[11px] text-warn/80">{t("backup.root.missing")}</p>
      <Button variant="ghost" size="sm" onClick={root.recheck}>
        {t("backup.root.recheck")}
      </Button>
    </div>
  );
}
