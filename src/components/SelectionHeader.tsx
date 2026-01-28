import { Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface SelectionHeaderProps {
    isAllSelected: boolean;
    onToggle: () => void;
    selectedCount: number;
    totalCount?: number; // Opsiyonel, bilgi amaçlı
    label?: string; // Eğer custom label istenirse
    title?: string; // Default: "IDENTIFIER"
    statusTitle?: string; // Default: "STATUS"
    disabled?: boolean;
    className?: string;
}

export function SelectionHeader({
    isAllSelected,
    onToggle,
    selectedCount,
    label,
    title = "IDENTIFIER",
    statusTitle = "STATUS",
    disabled,
    className
}: SelectionHeaderProps) {
    return (
        <div className={cn("mx-4 mt-2 mb-1 pl-1 flex items-center gap-3 select-none border-b border-zinc-900/50 pb-2 bg-black/40", className)}>
            <div
                onClick={() => !disabled && onToggle()}
                className={cn(
                    "flex items-center gap-4 cursor-pointer group transition-all min-w-[200px]",
                    disabled && "opacity-50 pointer-events-none"
                )}
            >
                <div className={cn(
                    "w-4 h-4 border flex items-center justify-center transition-all shrink-0",
                    isAllSelected
                        ? "border-terminal-green bg-terminal-green"
                        : "border-zinc-700 group-hover:border-terminal-green/50"
                )}>
                    {isAllSelected && <Check className="w-3 h-3 text-black" />}
                </div>
                <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest group-hover:text-terminal-green/80 transition-colors whitespace-nowrap">
                    {label || `SELECT ALL (${selectedCount})`}
                </span>
            </div>

            <div className="flex-1 text-[9px] font-mono text-zinc-600 uppercase tracking-widest text-center opacity-50 hidden sm:block">
                {title}
            </div>

            <div className="w-24 text-right text-[9px] font-mono text-zinc-600 uppercase tracking-widest opacity-50 hidden sm:block">
                {statusTitle}
            </div>
        </div>
    );
}
