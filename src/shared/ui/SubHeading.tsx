import type { ReactNode } from "react";

/**
 * A heading inside a section, underlined like the active tab. The settings page uses levels
 * instead: `section` for a section title with a short fading line, `sub` for a title inside one.
 */
export function SubHeading({
  children,
  level,
}: {
  children: ReactNode;
  level?: "section" | "sub";
}) {
  if (level === "section") {
    return (
      <h3 className="mb-3 flex items-center gap-3">
        <span className="text-[13px] tracking-widest text-neon uppercase">{children}</span>
        <span aria-hidden className="h-px w-30 bg-linear-to-r from-neon/60 to-transparent" />
      </h3>
    );
  }
  if (level === "sub") {
    return (
      <span className="mb-2 block text-[11px] tracking-widest text-neon/70 uppercase">
        {children}
      </span>
    );
  }
  return (
    <span className="mb-3 inline-block border-b-2 border-neon pb-1 text-[11px] tracking-widest text-neon uppercase">
      {children}
    </span>
  );
}
