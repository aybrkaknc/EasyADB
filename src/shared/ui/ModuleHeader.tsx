import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function ModuleHeader({
  icon: Icon,
  title,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4 p-6 pb-2">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <Icon className="size-6 text-neon" aria-hidden />
          <h1 className="heading text-2xl">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
