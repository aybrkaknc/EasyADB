import { createContext, type ReactNode, useContext } from "react";

import { cn } from "../lib/cn";

const Plain = createContext(false);

/** Inside the settings, panels have no side bar and their titles are underlined like tabs. */
export function PlainPanels({ children }: { children: ReactNode }) {
  return <Plain.Provider value>{children}</Plain.Provider>;
}

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
  const plain = useContext(Plain);
  if (plain) {
    return (
      <section className={className}>
        {title && (
          <h3 className="mb-4 text-xs font-medium tracking-widest text-white uppercase">{title}</h3>
        )}
        {actions && <div className="mb-3 flex items-center gap-2">{actions}</div>}
        {children}
      </section>
    );
  }
  return (
    <section className={cn("border-l-2 border-neon py-1 pl-4", className)}>
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
