import type { ButtonHTMLAttributes } from "react";

import { cn } from "../lib/cn";

type Variant = "primary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "border-neon/60 text-neon hover:bg-neon hover:text-black",
  ghost: "border-white/15 text-white/80 hover:border-neon/50 hover:text-neon",
  danger: "border-danger/60 text-danger hover:bg-danger hover:text-black",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type={type}
      className={cn(
        "clip-corners-sm inline-flex items-center justify-center gap-2 border bg-black/40 font-mono uppercase tracking-widest transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-4 py-2 text-[11px]",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
