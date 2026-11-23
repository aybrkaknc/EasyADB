import { ChevronDown, Smartphone, Usb, Wifi } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useTranslation } from "react-i18next";

import type { DeviceEntry } from "../../bindings";
import { useDevices } from "../../shared/hooks/useDevices";
import { cn } from "../../shared/lib/cn";
import { useAppStore } from "../store";
import { RootBadge } from "./RootBadge";

function stateColor(device: DeviceEntry) {
  if (device.state === "device") return "bg-neon";
  if (device.state === "unauthorized" || device.state === "offline") return "bg-danger";
  return "bg-warn";
}

function KindIcon({ device }: { device: DeviceEntry }) {
  const Icon = device.kind === "wifi" ? Wifi : device.kind === "usb" ? Usb : Smartphone;
  return <Icon className="size-3.5 shrink-0 text-white/60" aria-hidden />;
}

function name(device: DeviceEntry) {
  return device.model ?? device.serial;
}

export function DeviceSelector() {
  const { t } = useTranslation();
  const { devices, selected } = useDevices();
  const setSerial = useAppStore((s) => s.setSerial);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t("devices.select")}
        className="clip-corners-sm flex h-7 max-w-72 items-center gap-2 border border-line px-3 text-[11px] hover:border-neon/60"
      >
        {selected ? (
          <>
            <span className={cn("size-1.5 shrink-0", stateColor(selected))} />
            <KindIcon device={selected} />
            <RootBadge device={selected} />
            <span className="truncate">{name(selected)}</span>
            <span className="label shrink-0">{t(`devices.state.${selected.state}`)}</span>
          </>
        ) : (
          <span className="text-white/50">{t("devices.none")}</span>
        )}
        <ChevronDown className="size-3.5 shrink-0 text-white/50" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-72 border border-neon/40 bg-panel p-1 text-xs shadow-xl"
        >
          {devices.length === 0 && (
            <div className="px-3 py-2 text-white/50">{t("devices.none")}</div>
          )}
          {devices.map((device) => (
            <DropdownMenu.Item
              key={device.serial}
              onSelect={() => setSerial(device.serial)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 outline-none data-[highlighted]:bg-neon/10",
                device.serial === selected?.serial && "text-neon",
              )}
            >
              <span className={cn("size-1.5 shrink-0", stateColor(device))} />
              <KindIcon device={device} />
              <RootBadge device={device} />
              <span className="flex-1 truncate">{name(device)}</span>
              <span className="label">{t(`devices.kind.${device.kind}`)}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
