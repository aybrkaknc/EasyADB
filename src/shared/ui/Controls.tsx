import { Check } from "lucide-react";
import { Checkbox as RCheckbox, Switch as RSwitch, Tabs as RTabs } from "radix-ui";
import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full border border-white/15 bg-black/60 px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-white/30 focus:border-neon/60",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-xs", disabled && "opacity-40")}>
      <RCheckbox.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
        onClick={(e) => e.stopPropagation()}
        className="flex size-4 shrink-0 items-center justify-center border border-neon/50 bg-black data-[state=checked]:bg-neon"
      >
        <RCheckbox.Indicator>
          <Check className="size-3 text-black" strokeWidth={3} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {label}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-1.5 text-xs">
      <span>{label}</span>
      <RSwitch.Root
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-5 w-9 shrink-0 border border-neon/50 bg-black data-[state=checked]:bg-neon/30"
      >
        <RSwitch.Thumb className="block size-3.5 translate-x-0.5 bg-white/60 transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-neon" />
      </RSwitch.Root>
    </label>
  );
}

export const Tabs = RTabs.Root;
export const TabsContent = RTabs.Content;

export function TabsList({ tabs }: { tabs: { value: string; label: string }[] }) {
  return (
    <RTabs.List className="flex gap-1 border-b border-line px-6">
      {tabs.map((tab) => (
        <RTabs.Trigger
          key={tab.value}
          value={tab.value}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-[11px] tracking-widest text-white/60 uppercase hover:text-white data-[state=active]:border-neon data-[state=active]:text-neon"
        >
          {tab.label}
        </RTabs.Trigger>
      ))}
    </RTabs.List>
  );
}

export function FilterChips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "border px-2.5 py-1 text-[10px] tracking-widest uppercase transition-colors",
            value === option.value
              ? "border-neon bg-neon/15 text-neon"
              : "border-white/15 text-white/60 hover:text-white",
          )}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1.5 opacity-60">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
