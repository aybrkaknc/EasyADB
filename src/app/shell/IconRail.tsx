import { Tooltip } from "radix-ui";
import { useTranslation } from "react-i18next";

import { cn } from "../../shared/lib/cn";
import { MODULE_ICONS } from "../modules";
import { MODULES, useAppStore } from "../store";

export function IconRail() {
  const { t } = useTranslation();
  const module = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);
  const railOpen = useAppStore((s) => s.railOpen);

  return (
    <Tooltip.Provider delayDuration={300}>
      <nav
        className={cn(
          "flex shrink-0 flex-col gap-1 overflow-hidden border-r border-line bg-black px-2 py-3 transition-[width] duration-150",
          railOpen ? "w-44" : "w-14",
        )}
        aria-label="Modules"
      >
        {MODULES.map((id) => {
          const Icon = MODULE_ICONS[id];
          const active = id === module;
          const label = t(`modules.${id}.title`);
          const button = (
            <button
              type="button"
              onClick={() => setModule(id)}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 shrink-0 items-center transition-colors",
                railOpen ? "w-full gap-2" : "w-10 justify-center",
                active ? "text-neon" : "text-white/50 hover:text-white",
              )}
            >
              {active && <span className="absolute inset-y-1 left-0 w-0.5 bg-neon" />}
              <span className="flex size-10 shrink-0 items-center justify-center">
                <Icon className="size-5" />
              </span>
              {railOpen && (
                <span className="truncate text-[11px] tracking-widest uppercase">{label}</span>
              )}
            </button>
          );
          if (railOpen) return <div key={id}>{button}</div>;
          return (
            <Tooltip.Root key={id}>
              <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="right"
                  sideOffset={8}
                  className="z-50 border border-neon/40 bg-panel px-2 py-1 text-[11px]"
                >
                  {label}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </nav>
    </Tooltip.Provider>
  );
}
