import { useTranslation } from "react-i18next";

import { useDevices } from "../../shared/hooks/useDevices";
import { MODULE_ICONS } from "../../app/modules";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { ArchiveTab } from "./ArchiveTab";

export function RestoreView() {
  const { t } = useTranslation();
  const { selected } = useDevices();
  return (
    <>
      <ModuleHeader icon={MODULE_ICONS.restore} title={t("modules.restore.title")} />
      <div className="flex min-h-0 flex-1 flex-col">
        <ArchiveTab device={selected} />
      </div>
    </>
  );
}
