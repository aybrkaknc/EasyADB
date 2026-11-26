import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

/** A list of sections on the left (on top when narrow) with the selected one beside it. */
export function SectionNav<T extends string>({
  label,
  sections,
  value,
  onChange,
  children,
}: {
  label: string;
  sections: { id: T; icon: LucideIcon; label: string }[];
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6 lg:flex-row lg:items-start lg:gap-10">
      <nav
        aria-label={label}
        className="flex shrink-0 flex-row flex-wrap gap-1 lg:w-44 lg:flex-col"
      >
        {sections.map(({ id, icon: Icon, label: name }) => (
          <button
            key={id}
            type="button"
            aria-current={id === value ? "true" : undefined}
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-2 border px-3 py-2 text-left text-[11px] tracking-widest uppercase transition-colors",
              id === value
                ? "border-neon bg-neon/15 text-neon"
                : "border-white/15 text-white/60 hover:text-white",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {name}
          </button>
        ))}
      </nav>
      <div className="w-full max-w-3xl min-w-0">{children}</div>
    </div>
  );
}
