import { Tooltip } from "radix-ui";
import { useTranslation } from "react-i18next";

import { cn } from "../../shared/lib/cn";
import { MODULE_ICONS } from "../modules";
import { MODULES, useAppStore } from "../store";

export function IconRail() {
  const { t } = useTranslation();
  const module = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);

  return (
    <Tooltip.Provider delayDuration={300}>
      <nav
        className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 border-r border-line bg-black py-3"
        aria-label="Modules"
      >
        {MODULES.map((id) => {
          const Icon = MODULE_ICONS[id];
          const active = id === module;
          return (
            <Tooltip.Root key={id}>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={() => setModule(id)}
                  aria-label={t(`modules.${id}.title`)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex size-10 items-center justify-center transition-colors",
                    active ? "bg-neon/10 text-neon" : "text-white/50 hover:text-white",
                  )}
                >
                  {active && <span className="absolute inset-y-1 left-0 w-0.5 bg-neon" />}
                  <Icon className="size-5" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="right"
                  sideOffset={8}
                  className="z-50 border border-neon/40 bg-panel px-2 py-1 text-[11px]"
                >
                  {t(`modules.${id}.title`)}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </nav>
    </Tooltip.Provider>
  );
}
