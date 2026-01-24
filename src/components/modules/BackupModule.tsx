import { useState, useMemo } from 'react';
import { usePackages } from '../../hooks/usePackages';
import { formatAppName, cn } from '../../lib/utils';
import { PackageInfo } from '../../types/adb';
import { RefreshCw, Package } from 'lucide-react';

interface PackageItemProps {
    pkg: PackageInfo;
    selected: boolean;
    onToggle: (pkg: PackageInfo) => void;
}

function PackageItem({ pkg, selected, onToggle }: PackageItemProps) {
    return (
        <div
            onClick={() => onToggle(pkg)}
            role="button"
            tabIndex={0}
            className={cn(
                "group relative flex items-center justify-between p-3.5 transition-all duration-300 cursor-pointer overflow-hidden",
                "border border-terminal-green/10 bg-zinc-950/20",
                selected
                    ? "border-terminal-green/50 bg-terminal-green/10 shadow-[0_0_20px_rgba(0,255,65,0.05)]"
                    : "hover:border-terminal-green/30 hover:bg-zinc-900/40"
            )}
            style={{
                clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))'
            }}
        >
            <div className="absolute inset-0 w-full h-[1px] bg-terminal-green/10 -translate-y-full group-hover:animate-scanline pointer-events-none opacity-40" />

            <div className="flex flex-col overflow-hidden relative z-10">
                <span className={cn(
                    "text-[12px] truncate font-space font-black tracking-wider transition-colors uppercase",
                    selected ? "text-white" : "text-terminal-green/90 group-hover:text-terminal-green"
                )}>
                    {formatAppName(pkg.name)}
                </span>
                <span className="text-[9px] text-zinc-500 truncate font-mono mt-1 tracking-tighter group-hover:text-zinc-400 transition-colors">
                    {pkg.name}
                </span>
            </div>

            <div className="flex items-center gap-4 relative z-10 shrink-0">
                <div className={cn(
                    "h-6 w-[1px] transition-colors",
                    selected ? "bg-terminal-green/40" : "bg-terminal-green/10"
                )} />
                <div className={cn(
                    "w-2.5 h-2.5 transition-all duration-500",
                    selected
                        ? "bg-terminal-green rotate-45 shadow-[0_0_10px_rgba(0,255,65,1)]"
                        : "bg-terminal-green/10 group-hover:bg-terminal-green/40"
                )} />
            </div>
        </div>
    );
}

interface BackupModuleProps {
    deviceId?: string;
    selectedPackages: PackageInfo[];
    onTogglePackage: (pkg: PackageInfo) => void;
    onRefresh?: () => void;
    refreshTrigger?: number;
}

export function BackupModule({
    deviceId,
    selectedPackages,
    onTogglePackage,
    onRefresh,
    refreshTrigger = 0
}: BackupModuleProps) {
    const { packages, loading, error } = usePackages(deviceId, refreshTrigger);
    const [search, setSearch] = useState('');

    const filteredPackages = useMemo(() =>
        packages.filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
        [packages, search]
    );

    const isSelected = (pkg: PackageInfo) => selectedPackages.some(p => p.name === pkg.name);

    return (
        <div className="flex flex-col h-full bg-black relative overflow-hidden">
            <div className="p-4 border-b border-terminal-green/20 bg-zinc-950/40 relative z-10">
                <div className="group flex items-center space-x-3 relative">
                    <div className="flex-1 relative group/search">
                        <input
                            type="text"
                            placeholder="SEARCH_REPOSITORY..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-terminal-green/20 text-terminal-green px-3 py-2 text-[10px] focus:outline-none focus:border-terminal-green/60 placeholder:text-terminal-green/20 font-mono tracking-widest uppercase transition-all"
                        />
                    </div>

                    <div className="flex items-center space-x-3">
                        <div className="flex flex-col items-end">
                            <span className="text-white font-black text-[10px] tabular-nums">
                                {filteredPackages.length}
                            </span>
                            <span className="text-terminal-green/40 text-[7px] font-space font-black tracking-widest">PACKETS</span>
                        </div>
                        <button
                            onClick={onRefresh}
                            className="text-terminal-green/60 hover:text-terminal-green hover:bg-terminal-green/10 p-2 border border-terminal-green/20 transition-all rounded-none"
                        >
                            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-terminal-green/10 relative z-10 bg-zinc-950/10">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 space-y-5">
                        <div className="w-12 h-12 border-2 border-terminal-green/20 border-t-terminal-green rounded-full animate-spin shadow-[0_0_15px_rgba(0,255,65,0.2)]" />
                        <span className="text-[10px] font-space font-black text-terminal-green/40 tracking-[0.3em] animate-pulse">INDEX_SCAN_ACTIVE</span>
                    </div>
                ) : error ? (
                    <div className="p-6 text-red-500 text-[10px] font-mono border border-red-500/20 bg-red-500/5 uppercase tracking-widest">
                        CRIT_ERROR: SYNC_FAILED // {error}
                    </div>
                ) : filteredPackages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 opacity-20">
                        <Package className="w-12 h-12 text-terminal-green mb-4" />
                        <div className="text-center text-terminal-green text-[10px] font-space font-black uppercase tracking-[0.4em]">Zero data points found</div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredPackages.map((pkg) => (
                            <PackageItem
                                key={pkg.name}
                                pkg={pkg}
                                selected={isSelected(pkg)}
                                onToggle={onTogglePackage}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
