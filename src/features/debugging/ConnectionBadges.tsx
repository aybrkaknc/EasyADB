import { Bug, Smartphone, Usb } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAppStore } from "../../app/store";
import { useDevices } from "../../shared/hooks/useDevices";
import { cn } from "../../shared/lib/cn";
import type { Phone } from "../../shared/lib/phones";

const ICONS = { usb: Usb, wifi: Bug, emulator: Smartphone };

/** One button per connection of a phone; pressing it makes EasyADB use that connection. */
export function ConnectionBadges({ phone }: { phone: Phone }) {
  const { t } = useTranslation();
  const { selected } = useDevices();
  const setSerial = useAppStore((s) => s.setSerial);
  return (
    <div className="flex flex-wrap gap-1">
      {phone.devices.map((device) => {
        const Icon = ICONS[device.kind];
        const used = selected?.serial === device.serial;
        return (
          <button
            key={device.serial}
            type="button"
            aria-pressed={used}
            title={device.serial}
            onClick={() => setSerial(device.serial)}
            className={cn(
              "flex items-center gap-1 border px-1.5 py-0.5 text-[11px] tracking-widest uppercase",
              used
                ? "border-neon bg-neon/15 text-neon"
                : "border-white/15 text-white/60 hover:text-white",
            )}
          >
            <Icon className="size-3" aria-hidden />
            {t(`devices.kind.${device.kind}`)}
          </button>
        );
      })}
    </div>
  );
}
