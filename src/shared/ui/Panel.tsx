import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export function Panel({
  title,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("clip-corners border border-line bg-panel/70 p-4", className)}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="label text-neon/80">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function KeyValue({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5 text-xs">
      {rows.map(([key, value], index) => (
        <div key={index} className="contents">
          <dt className="label self-center">{key}</dt>
          <dd className="truncate text-white" title={typeof value === "string" ? value : undefined}>
            {value || "-"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
