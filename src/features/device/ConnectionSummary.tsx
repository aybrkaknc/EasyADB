import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../../app/store";
import { commands, type DeviceEntry } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";
import { groupPhones, phoneKey } from "../../shared/lib/phones";
import { Button } from "../../shared/ui/Button";
import { KeyValue, Panel } from "../../shared/ui/Panel";
import { ConnectionBadges } from "../debugging/ConnectionBadges";

/** How the selected phone is connected, with the way to the connection screen. */
export function ConnectionSummary({ device }: { device: DeviceEntry }) {
  const { t } = useTranslation();
  const { devices } = useDevices();
  const openSettings = useAppStore((s) => s.openSettings);
  const phone = groupPhones(devices).find((p) => p.key === phoneKey(device));
  const wireless = phone?.devices.find((d) => d.kind === "wifi");
  const found = useQuery({
    queryKey: ["discovery"],
    queryFn: () => commands.wirelessDiscover(),
    enabled: wireless !== undefined,
  });
  const address =
    wireless &&
    (found.data?.phones.find((p) => p.connected.includes(wireless.serial))?.addresses[0] ??
      wireless.serial);
  const others = phone?.devices.filter((d) => d.serial !== device.serial) ?? [];
  return (
    <Panel
      title={t("device.connection.title")}
      actions={
        <Button size="sm" variant="ghost" onClick={() => openSettings("debugging")}>
          {t("debugging.open")}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {phone && <ConnectionBadges phone={phone} />}
        <KeyValue
          rows={[
            [t("device.connection.used"), t(`devices.kindLong.${device.kind}`)],
            ...(address ? ([[t("device.connection.address"), address]] as [string, string][]) : []),
            [
              t("device.connection.also"),
              others.map((d) => t(`devices.kindLong.${d.kind}`)).join(", "),
            ],
          ]}
        />
      </div>
    </Panel>
  );
}
