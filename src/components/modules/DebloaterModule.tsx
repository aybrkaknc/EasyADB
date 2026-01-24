import { useState } from 'react';
import { Search, RefreshCw, Trash2, Power, PowerOff, CheckSquare, Square, AlertTriangle, Filter, RotateCcw, ShieldCheck, ShieldAlert, BadgeHelp, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DebloaterPackage } from '../../types/adb';
import { DebloaterFilter } from '../../hooks/useDebloater';

// =====================================================================
// DEBLOATER SIDEBAR
// =====================================================================

interface DebloaterSidebarProps {
    filter: DebloaterFilter;
    onFilterChange: (filter: DebloaterFilter) => void;
    search: string;
    onSearchChange: (search: string) => void;
    onRefresh: () => void;
    isLoading: boolean;
    totalCount: number;
    filteredCount: number;
    disabled: boolean;
}

const FILTERS: { id: DebloaterFilter; label: string; description: string }[] = [
    { id: 'user', label: 'USER APPS', description: '3rd party & safe' },
    { id: 'system', label: 'SYSTEM APPS', description: 'OEM bloatware' },
    { id: 'disabled', label: 'DISABLED', description: 'Frozen apps' },
    { id: 'uninstalled', label: 'UNINSTALLED', description: 'Removed (User 0)' },
    { id: 'all', label: 'ALL PACKAGES', description: 'Everything' },
];

export function DebloaterSidebar({
    filter,
    onFilterChange,
    search,
    onSearchChange,
    onRefresh,
    isLoading,
    totalCount,
    filteredCount,
    disabled,
}: DebloaterSidebarProps) {
    return (
        <div className="flex flex-col h-full bg-black">
            <div className="p-4 border-b border-terminal-green/20 bg-zinc-950/20">
                <h2 className="text-xs font-space font-black text-terminal-green tracking-[0.2em] flex items-center gap-2 uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                    <Filter className="w-3.5 h-3.5 text-terminal-green" />
                    DEBLOATER_CORE
                </h2>
                <div className="flex items-center gap-2 mt-1.5 font-mono text-[9px] tracking-widest uppercase">
                    <span className="text-zinc-500 font-bold">{totalCount} PACKETS</span>
                    <div className="w-1 h-1 bg-terminal-green/30 rounded-full" />
                    <span className="text-terminal-green/60">{filteredCount} MAPPED</span>
                </div>
            </div>

            <div className="p-3 border-b border-terminal-green/10">
                <div className="relative group/search">
                    <div className="absolute inset-0 bg-terminal-green/5 blur-sm opacity-0 group-focus-within/search:opacity-100 transition-opacity" />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-terminal-green/40 group-focus-within/search:text-terminal-green transition-colors" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="IDENTIFY_PACKAGE..."
                        disabled={disabled}
                        className="w-full pl-9 pr-4 py-2 bg-zinc-950/50 border border-terminal-green/20 rounded-none text-xs font-mono text-terminal-green placeholder:text-terminal-green/20 focus:outline-none focus:border-terminal-green/60 transition-all uppercase tracking-widest"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-terminal-green/10">
                <div className="px-4 py-2 mt-4 text-[9px] font-space font-black text-terminal-green/30 uppercase tracking-[0.25em]">
                    FILTER_PROTOCOLS
                </div>
                {FILTERS.map((f) => (
                    <button
                        key={f.id}
                        onClick={() => onFilterChange(f.id)}
                        disabled={disabled}
                        className={cn(
                            "w-full flex items-center px-4 py-3 text-left border-l-2 transition-all group/filter",
                            filter === f.id
                                ? "border-terminal-green bg-terminal-green/10"
                                : "border-transparent text-terminal-green/50 hover:bg-terminal-green/5 hover:text-terminal-green",
                            disabled && "opacity-30 cursor-not-allowed"
                        )}
                    >
                        <div className="flex flex-col">
                            <span className={cn("font-space font-black text-[10px] tracking-widest", filter === f.id ? "text-white drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "group-hover/filter:text-white")}>{f.label}</span>
                            <span className="text-[8px] text-zinc-500 font-mono mt-0.5 tracking-tighter uppercase">{f.description}</span>
                        </div>
                    </button>
                ))}

                <div className="p-3 mt-6">
                    <button
                        onClick={onRefresh}
                        disabled={disabled || isLoading}
                        className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-zinc-950 border border-terminal-green/20 text-terminal-green hover:border-terminal-green/60 hover:bg-terminal-green/5 transition-all group shadow-lg"
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                        <span className="font-space font-black text-[10px] tracking-[0.2em]">
                            {isLoading ? 'SYNCING...' : 'RELOAD_INDEX'}
                        </span>
                    </button>
                </div>
            </div>

            <div className="p-4 mt-auto border-t border-terminal-green/5 text-[8px] text-terminal-green/30 font-mono tracking-[0.3em] text-center uppercase">
                SUBSYSTEM_DEBLOAT v1.2
            </div>
        </div>
    );
}

// =====================================================================
// DEBLOATER SUB-COMPONENTS
// =====================================================================

function SafetyBadge({ recommendation }: { recommendation: DebloaterPackage['recommendation'] }) {
    let SafetyIcon = BadgeHelp;
    let color = "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
    let label = "UNKNOWN";

    if (recommendation === 'safe') {
        SafetyIcon = ShieldCheck;
        color = "text-emerald-400 bg-emerald-400/10 border-emerald-400/30";
        label = "SAFE";
    } else if (recommendation === 'recommended') {
        SafetyIcon = ShieldCheck;
        color = "text-terminal-green bg-terminal-green/10 border-terminal-green/40 shadow-[0_0_12px_rgba(34,197,94,0.15)]";
        label = "RECOMMENDED";
    } else if (recommendation === 'advanced') {
        SafetyIcon = AlertTriangle;
        color = "text-terminal-amber bg-terminal-amber/10 border-terminal-amber/30";
        label = "ADVANCED";
    } else if (recommendation === 'expert') {
        SafetyIcon = AlertTriangle;
        color = "text-orange-500 bg-orange-500/10 border-orange-500/30";
        label = "EXPERT";
    } else if (recommendation === 'unsafe') {
        SafetyIcon = ShieldAlert;
        color = "text-red-500 bg-red-500/10 border-red-500/40 animate-pulse";
        label = "UNSAFE";
    }

    return (
        <span className={cn(
            "text-[9px] font-space font-black px-3 py-1 flex items-center gap-1.5 min-w-[90px] justify-center tracking-widest border",
            color
        )}>
            <SafetyIcon className="w-3 h-3" />
            {label}
        </span>
    );
}

function StatusBadge({ pkg }: { pkg: DebloaterPackage }) {
    const status = pkg.is_uninstalled ? 'PURGED' : pkg.is_disabled ? 'FROZEN' : 'ACTIVE';
    const color = pkg.is_uninstalled
        ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
        : pkg.is_disabled
            ? "bg-red-500/20 text-red-500 border-red-500/30"
            : "bg-terminal-green/10 text-terminal-green border-terminal-green/30";

    return (
        <span className={cn("text-[9px] font-space font-black px-3 py-1 tracking-widest border uppercase", color)}>
            {status}
        </span>
    );
}

interface PackageRowProps {
    pkg: DebloaterPackage;
    isSelected: boolean;
    isProcessing: boolean;
    onToggle: (name: string) => void;
}

function PackageRow({ pkg, isSelected, isProcessing, onToggle }: PackageRowProps) {
    return (
        <button
            onClick={() => onToggle(pkg.name)}
            disabled={isProcessing}
            className={cn(
                "w-full flex items-center px-6 py-4 text-left transition-all group/item overflow-hidden relative",
                "border-b border-terminal-green/5 bg-zinc-950/20",
                isSelected
                    ? "bg-terminal-green/5 border-l-[3px] border-l-terminal-green"
                    : "border-l-[3px] border-l-transparent hover:bg-zinc-900/40"
            )}
        >
            <div className="absolute inset-0 w-full h-[1px] bg-terminal-green/20 -translate-y-full group-hover/item:animate-scanline pointer-events-none opacity-50" />

            <div className="mr-5 text-terminal-green/40">
                {isSelected
                    ? <CheckSquare className="w-5 h-5 text-terminal-green drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                    : <Square className="w-5 h-5 group-hover/item:text-terminal-green/60 transition-colors" />}
            </div>

            <div className="flex-1 min-w-0 pr-6 relative z-10">
                <div className={cn(
                    "font-mono text-[13px] tracking-tight truncate transition-colors",
                    isSelected ? "text-white font-black" : "text-terminal-green/80 group-hover:text-terminal-green"
                )}>
                    {pkg.name}
                </div>
                {pkg.description ? (
                    <div className="text-[10px] text-zinc-500 truncate mt-1 font-mono group-hover/item:text-zinc-400 transition-colors uppercase tracking-tight">
                        {pkg.description}
                    </div>
                ) : (
                    <div className="text-[9px] text-zinc-600 truncate mt-1 font-mono italic uppercase">No meta description found</div>
                )}
            </div>

            <div className="w-32 text-center flex justify-center shrink-0">
                <SafetyBadge recommendation={pkg.recommendation} />
            </div>

            <div className="w-28 text-center shrink-0">
                <StatusBadge pkg={pkg} />
            </div>
        </button>
    );
}

interface FloatingActionsProps {
    count: number;
    isProcessing: boolean;
    filter: DebloaterFilter;
    onDisable: () => void;
    onEnable: () => void;
    onUninstall: () => void;
    onReinstall: () => void;
}

function FloatingActions({ count, isProcessing, filter, onDisable, onEnable, onUninstall, onReinstall }: FloatingActionsProps) {
    return (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30">
            <div
                className="flex items-center gap-2 p-2 bg-zinc-950/95 backdrop-blur-2xl border border-terminal-green/40 shadow-[0_0_50px_rgba(0,0,0,0.9)] ring-1 ring-terminal-green/20"
                style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))' }}
            >
                <div className="px-5 py-2.5 mr-2 bg-terminal-green/10 flex items-center gap-3 border-r border-terminal-green/20">
                    <span className="w-2 h-2 bg-terminal-green animate-ping rotate-45" />
                    <span className="text-[11px] font-space font-black text-terminal-green tracking-[0.25em]">{count}_NODES_ARMED</span>
                </div>

                <div className="flex items-center gap-2 px-3">
                    <ActionButton icon={PowerOff} label="FREEZE_NODE" color="text-terminal-amber" onClick={onDisable} disabled={isProcessing} />
                    <ActionButton icon={Power} label="ACTIVATE_NODE" color="text-terminal-green" onClick={onEnable} disabled={isProcessing} />
                    <ActionButton icon={Trash2} label="PURGE_STORAGE" color="text-red-500" onClick={onUninstall} disabled={isProcessing} />

                    {filter === 'uninstalled' && (
                        <>
                            <div className="w-px h-6 bg-terminal-green/10 mx-2" />
                            <ActionButton icon={RotateCcw} label="RESTORE_NODE" color="text-blue-400" onClick={onReinstall} disabled={isProcessing} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function ActionButton({ icon: Icon, label, color, onClick, disabled }: { icon: any, label: string, color: string, onClick: () => void, disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn("group relative p-3 rounded-none transition-all disabled:opacity-30", color, "hover:bg-zinc-800/80 hover:scale-110 active:scale-95 border border-transparent hover:border-current/20")}
        >
            <Icon className="w-5 h-5 drop-shadow-[0_0_8px_rgba(current,0.4)]" />
            <span className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black border border-terminal-green/40 text-[10px] font-space font-black tracking-[0.2em] text-white opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 shadow-2xl whitespace-nowrap pointer-events-none z-50">
                {label}
            </span>
        </button>
    );
}

interface DebloaterViewProps {
    packages: DebloaterPackage[];
    selectedPackages: Set<string>;
    onTogglePackage: (name: string) => void;
    onToggleSelectAll: () => void;
    isLoading: boolean;
    isProcessing: boolean;
    disabled: boolean;
    showSystemWarning: boolean;
    onDismissWarning: () => void;
    error: string | null;
    onDisable: () => void;
    onEnable: () => void;
    onUninstall: () => void;
    onReinstall: () => void;
    filter: DebloaterFilter;
}

export function DebloaterView({
    packages,
    selectedPackages,
    onTogglePackage,
    onToggleSelectAll,
    isLoading,
    isProcessing,
    disabled,
    showSystemWarning,
    onDismissWarning,
    error,
    onDisable,
    onEnable,
    onUninstall,
    onReinstall,
    filter,
}: DebloaterViewProps) {
    const [acknowledgedWarning, setAcknowledgedWarning] = useState(false);

    if (disabled) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-terminal-green/60 space-y-6 font-space p-12">
                <div className="relative">
                    <Trash2 className="w-16 h-16 text-terminal-green/10 animate-pulse" />
                    <div className="absolute inset-0 bg-terminal-green/20 blur-2xl animate-pulse" />
                </div>
                <div className="text-center">
                    <p className="text-lg font-black text-white tracking-[0.4em] uppercase mb-2">DEBLOATER_OFFLINE</p>
                    <p className="text-xs text-terminal-green/40 font-mono tracking-widest uppercase">Link physical node to populate index...</p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-terminal-green/60 space-y-6 font-space">
                <RefreshCw className="w-12 h-12 text-terminal-green animate-spin drop-shadow-[0_0_15px_#00ff41]" />
                <p className="text-sm font-black text-white tracking-[0.3em] uppercase animate-pulse">Scanning_Memory_Cells...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-red-500/80 space-y-4 p-12">
                <AlertTriangle className="w-16 h-16 animate-bounce" />
                <div className="text-center">
                    <p className="text-lg font-black text-white tracking-[0.3em] uppercase mb-2">ACCESS_DENIED</p>
                    <p className="text-sm font-mono text-red-500/60 max-w-md">{error}</p>
                </div>
            </div>
        );
    }

    if (showSystemWarning && !acknowledgedWarning) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-950/40 backdrop-blur-md">
                <div className="border border-terminal-amber/50 bg-black/80 p-12 max-w-2xl text-center shadow-[0_0_100px_rgba(245,158,11,0.1)] relative overflow-hidden"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 24px 100%, 0 calc(100% - 24px))' }}>
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-terminal-amber/40 to-transparent" />
                    <AlertTriangle className="w-20 h-20 text-terminal-amber mx-auto mb-8 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]" />
                    <h2 className="text-2xl font-space font-black text-white mb-4 tracking-[0.3em] uppercase">
                        CRITICAL_SYSTEM_ACCESS
                    </h2>
                    <p className="text-sm text-zinc-400 font-mono mb-10 leading-relaxed uppercase tracking-tight">
                        You are attempting to access <span className="text-terminal-amber font-bold">SYSTEM_PROTCOLS</span>.
                        Modification of these cores can lead to <span className="text-red-400">SESSION_TERMINATION</span> (bootloop)
                        or permanent hardware malfunction.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-5 justify-center">
                        <button
                            onClick={() => {
                                setAcknowledgedWarning(true);
                                onDismissWarning();
                            }}
                            className="px-10 py-4 bg-terminal-amber text-black font-space font-black text-xs tracking-widest hover:bg-white transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                        >
                            ACCEPT_TERMS
                        </button>
                        <button
                            onClick={onDismissWarning}
                            className="px-10 py-4 border border-zinc-700 text-zinc-400 font-space font-black text-xs tracking-widest hover:text-white hover:border-white transition-all"
                        >
                            ABORT_ACCESS
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const allSelected = packages.length > 0 && selectedPackages.size === packages.length;
    const selectedCount = selectedPackages.size;

    return (
        <div className="flex-1 flex flex-col h-full w-full min-w-0 bg-black relative overflow-hidden">
            {/* BACKGROUND DECOR */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.05] z-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,65,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,65,0.1)_1px,transparent_1px)] bg-[size:60px_60px]" />
            </div>

            <div className="flex items-center px-6 py-3 bg-zinc-950/80 border-b border-terminal-green/20 text-[10px] font-space font-black text-terminal-green/60 uppercase tracking-[0.25em] sticky top-0 z-20 backdrop-blur-md">
                <button
                    onClick={onToggleSelectAll}
                    className="mr-5 text-terminal-green/40 hover:text-terminal-green transition-colors p-1"
                >
                    {allSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                </button>
                <div className="flex-1">ID_NAMESPACE</div>
                <div className="w-32 text-center">INTEGRITY_INDEX</div>
                <div className="w-28 text-center px-2">SYST_LINK</div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-terminal-green/10 pb-28 relative z-10">
                {packages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-terminal-green/10 font-space font-black tracking-[0.5em] uppercase p-12 text-center">
                        <Layers className="w-12 h-12 mb-4 opacity-10" />
                        No identifying data found in current sector
                    </div>
                ) : (
                    packages.map((pkg) => (
                        <PackageRow
                            key={pkg.name}
                            pkg={pkg}
                            isSelected={selectedPackages.has(pkg.name)}
                            isProcessing={isProcessing}
                            onToggle={onTogglePackage}
                        />
                    ))
                )}
            </div>

            {selectedCount > 0 && (
                <FloatingActions
                    count={selectedCount}
                    isProcessing={isProcessing}
                    filter={filter}
                    onDisable={onDisable}
                    onEnable={onEnable}
                    onUninstall={onUninstall}
                    onReinstall={onReinstall}
                />
            )}

            {isProcessing && (
                <div className="absolute inset-0 bg-black/95 flex items-center justify-center z-50 animate-fade-in backdrop-blur-xl">
                    <div className="text-center group">
                        <div className="relative mb-8">
                            <RefreshCw className="w-16 h-16 text-terminal-green animate-spin mx-auto drop-shadow-[0_0_20px_#00ff41]" />
                            <div className="absolute inset-0 bg-terminal-green/30 blur-3xl rounded-full" />
                        </div>
                        <p className="text-lg font-space font-black text-white tracking-[0.5em] uppercase mb-2">EXECUTING_COMMANDS</p>
                        <p className="text-[10px] font-mono text-zinc-500 tracking-widest animate-pulse">OVERWRITING_TARGET_SECTORS...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
