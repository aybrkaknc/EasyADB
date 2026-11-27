import { Bell, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useTranslation } from "react-i18next";

import { usePhoneDialog, usePhoneFindings } from "./phoneNotice";

/** A bell with the notices of the phone. Picking the notice opens its question. */
export function PhoneNoticeBell() {
  const { t } = useTranslation();
  const { serial, fresh, files } = usePhoneFindings();
  const setOpen = usePhoneDialog((s) => s.setOpen);
  const dismiss = usePhoneDialog((s) => s.dismiss);
  const dismissed = usePhoneDialog((s) => s.dismissed);
  const shown = serial !== null && !dismissed.includes(serial);
  const count = shown ? fresh.length + files.length : 0;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t("notice.bell")}
        className="relative flex size-8 items-center justify-center text-neon/70 transition-colors hover:text-neon"
      >
        <span className="relative flex size-4 items-center justify-center">
          <Bell className="size-4" aria-hidden />
          {count > 0 && (
            <span className="absolute -top-1.5 -right-1.5 text-[11px] leading-none font-medium text-neon">
              {count}
            </span>
          )}
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-72 border border-neon/40 bg-panel p-1 text-xs shadow-xl"
        >
          {count === 0 && <div className="px-3 py-2 text-white/50">{t("notice.none")}</div>}
          {count > 0 && (
            <div className="flex items-center">
              <DropdownMenu.Item
                onSelect={() => setOpen(true)}
                className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 px-3 py-2 outline-none data-[highlighted]:bg-neon/10"
              >
                <span>{t("phone.title")}</span>
                <span className="text-white/50">{t("notice.count", { count })}</span>
              </DropdownMenu.Item>
              <button
                type="button"
                aria-label={t("notice.remove")}
                title={t("notice.remove")}
                onClick={() => serial !== null && dismiss(serial)}
                className="flex size-7 shrink-0 items-center justify-center text-white/50 hover:text-danger"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
