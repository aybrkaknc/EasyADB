import type { ReactNode } from "react";

/** A heading inside a section, underlined like the active tab. */
export function SubHeading({ children }: { children: ReactNode }) {
  return (
    <span className="mb-3 inline-block border-b-2 border-neon pb-1 text-[11px] tracking-widest text-neon uppercase">
      {children}
    </span>
  );
}
