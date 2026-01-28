import { Trash2, AlertTriangle, RefreshCw, Layers, ShieldAlert, Ban, Box, Check, CheckSquare, Square, Search } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { cn } from '../../lib/utils';
import { DebloaterPackage } from '../../types/adb';
import { DebloaterFilter } from '../../hooks/useDebloater';
import { smartFormatPackage } from '../../data/package-db';
import { SelectionHeader } from '../SelectionHeader';

/* -------------------------------------------------------------------------------------------------
 * MAIN VIEW COMPONENT (Sidebar-integrated Header)
 * -----------------------------------------------------------------------------------------------*/

interface DebloaterViewProps {
    packages: DebloaterPackage[];
    selectedPackages: Set<string>;
    onTogglePackage: (name: string) => void;
    onToggleSelectAll: () => void;
    isLoading: boolean;
    isProcessing: boolean;
    disabled: boolean;
    error: string | null;
    onDisable: () => void;
    onEnable: () => void;
    onUninstall: () => void;
    onReinstall: () => void;
    onRefresh: () => void;
    filter: DebloaterFilter;
    onFilterChange: (filter: DebloaterFilter) => void;
    search: string;
    onSearchChange: (search: string) => void;
    totalCount: number;
}

export function DebloaterView({
    packages,
    selectedPackages,
    onTogglePackage,
    onToggleSelectAll,
    isLoading,
    isProcessing,
    disabled,
    error,
    onDisable,
    onEnable,
    onUninstall,
    onReinstall,
    onRefresh,
    filter,
    onFilterChange,
    search,
    onSearchChange,
    totalCount
}: DebloaterViewProps) {

    return (
        <div className="flex flex-col h-full bg-black relative">
            {/* Standard Header Style (3-Row HUD) */}
            <div className="p-6 border-b border-terminal-green/20 bg-zinc-950/20 space-y-4 shrink-0">
                {/* Row 1: Brand & Stats */}
                <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3 mb-2">
                            <Trash2 className="w-6 h-6 text-terminal-green" />
                            <h2 className="text-2xl font-space font-black text-white tracking-[0.2em] uppercase drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                                DEBLOATER
                            </h2>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 font-mono text-[10px] tracking-widest uppercase">
                            <span className="text-white/80 font-bold">{totalCount} PACKAGES TO DEBLOAT</span>
                            <div className="w-1 h-1 bg-terminal-green/30 rounded-full" />
                            <span className="text-terminal-green/60">CONNECTED</span>
                        </div>
                    </div>

                </div>


                {/* Row 2: Category Filters Tabs & Search/Actions */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* Left: Filter Tabs */}
                    <div className="flex items-center gap-1">
                        <FilterTab
                            active={filter === 'all'}
                            label="ALL"
                            icon={Box}
                            onClick={() => onFilterChange('all')}
                            disabled={disabled}
                        />
                        <FilterTab
                            active={filter === 'user'}
                            label="USER"
                            icon={Layers}
                            onClick={() => onFilterChange('user')}
                            disabled={disabled}
                        />
                        <FilterTab
                            active={filter === 'system'}
                            label="SYSTEM"
                            icon={ShieldAlert}
                            variant="cyan"
                            onClick={() => onFilterChange('system')}
                            disabled={disabled}
                        />
                        <FilterTab
                            active={filter === 'disabled'}
                            label="DISABLED"
                            icon={Ban}
                            onClick={() => onFilterChange('disabled')}
                            disabled={disabled}
                        />
                        <FilterTab
                            active={filter === 'uninstalled'}
                            label="UNINSTALLED"
                            icon={Trash2}
                            onClick={() => onFilterChange('uninstalled')}
                            disabled={disabled}
                        />
                    </div>

                    {/* Right: Search & Actions */}
                    <div className="flex items-center gap-3">
                        <div className="relative group/search w-48 xl:w-64">
                            <div className="absolute inset-0 bg-terminal-green/5 blur-sm opacity-0 group-focus-within/search:opacity-100 transition-opacity pointer-events-none" />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-terminal-green/40 group-focus-within/search:text-terminal-green transition-colors pointer-events-none" />
                            <input
                                type="text"
                                placeholder="FILTER..."
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                disabled={disabled}
                                className="w-full pl-9 pr-4 py-2.5 bg-zinc-950/50 border border-terminal-green/20 rounded-none text-[10px] font-mono text-terminal-green placeholder:text-terminal-green/20 focus:outline-none focus:border-terminal-green/60 transition-all uppercase tracking-widest relative z-10"
                            />
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                            {/* Selected Stats */}
                            <div className="flex items-center gap-2 text-[10px] font-mono whitespace-nowrap">
                                <span className="text-terminal-green font-bold">{packages.length} VIEWER</span>
                                <div className="h-3 w-px bg-terminal-green/20" />
                                <span className={cn(selectedPackages.size > 0 ? "text-terminal-green animate-pulse" : "text-zinc-600")}>
                                    {selectedPackages.size} SELECTED
                                </span>
                            </div>

                            {/* Bulk / Select All */}
                            <button
                                onClick={onToggleSelectAll}
                                disabled={disabled || isLoading}
                                className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 hover:text-white transition-colors whitespace-nowrap border border-zinc-700 hover:border-terminal-green/40 px-3 py-2.5"
                            >
                                {selectedPackages.size === packages.length && packages.length > 0 ? (
                                    <>
                                        <CheckSquare className="w-3.5 h-3.5 text-terminal-green" /> DESELECT
                                    </>
                                ) : (
                                    <>
                                        <Square className="w-3.5 h-3.5" /> SELECT ALL
                                    </>
                                )}
                            </button>

                            {/* Refresh Button */}
                            <button
                                onClick={onRefresh}
                                disabled={disabled || isLoading}
                                className="group relative px-3 py-2.5 border border-zinc-700 hover:border-terminal-green/40 transition-all outline-none"
                                title="REFRESH LIST"
                            >
                                <RefreshCw className={cn(
                                    "w-3.5 h-3.5 text-zinc-400 group-hover:text-terminal-green transition-all",
                                    isLoading && "animate-spin text-terminal-green"
                                )} />
                            </button>

                            {/* Actions */}
                            {selectedPackages.size > 0 && !isProcessing && (
                                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-300">
                                    {filter === 'disabled' ? (
                                        <button onClick={onEnable} className="px-3 py-2.5 bg-terminal-green text-black font-space font-black text-[9px] tracking-[0.2em] hover:bg-white hover:text-black transition-all uppercase shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                                            ENABLE
                                        </button>
                                    ) : filter === 'uninstalled' ? (
                                        <button onClick={onReinstall} className="px-3 py-2.5 bg-terminal-green text-black font-space font-black text-[9px] tracking-[0.2em] hover:bg-white hover:text-black transition-all uppercase shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                                            REINSTALL
                                        </button>
                                    ) : (
                                        <>
                                            <button onClick={onDisable} className="px-3 py-2.5 bg-zinc-800 text-white border border-zinc-600 font-space font-black text-[9px] tracking-[0.2em] hover:bg-zinc-100 hover:text-black transition-all uppercase">
                                                DISABLE
                                            </button>
                                            <button onClick={onUninstall} className="px-3 py-2.5 bg-red-600 text-white border border-red-500 font-space font-black text-[9px] tracking-[0.2em] hover:bg-white hover:text-black transition-all uppercase shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                                                UNINSTALL
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>


            {/* Error Banner */}
            {
                error && (
                    <div className="bg-red-950/40 border-b border-red-500/50 p-2 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-[10px] font-mono text-red-200 uppercase tracking-widest">{error}</span>
                    </div>
                )
            }
            {/* Package List Header (Select All) */}
            <SelectionHeader
                isAllSelected={packages.length > 0 && packages.every(p => selectedPackages.has(p.name))}
                onToggle={onToggleSelectAll}
                selectedCount={selectedPackages.size}
                label={`SELECT ALL (${selectedPackages.size} ACROSS TABS)`}
                title="PACKAGE IDENTIFIER"
                statusTitle="STATUS"
                disabled={disabled}
            />

            {/* Package List Container (Virtualized) */}
            <div className="flex-1 overflow-hidden p-2">
                {
                    isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-terminal-green/40 gap-4" >
                            <RefreshCw className="w-8 h-8 animate-spin" />
                            <span className="text-xs font-mono animate-pulse">FETCHING PACKAGE LIST...</span>
                        </div>
                    ) : packages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4">
                            <Box className="w-12 h-12 opacity-20" />
                            <span className="text-xs font-mono uppercase">NO PACKAGES FOUND IN THIS CATEGORY</span>
                        </div>
                    ) : (
                        <Virtuoso
                            style={{ height: '100%', width: '100%' }}
                            data={packages}
                            className="scrollbar-thin scrollbar-thumb-terminal-green/10"
                            itemContent={(_, pkg) => (
                                <PackageRow
                                    pkg={pkg}
                                    selectedPackages={selectedPackages}
                                    disabled={disabled}
                                    onToggle={onTogglePackage}
                                />
                            )}
                        />
                    )
                }
            </div>
        </div>
    );
}

// Virtualized Row Component
const PackageRow = ({ pkg, selectedPackages, disabled, onToggle }: { pkg: DebloaterPackage, selectedPackages: Set<string>, disabled: boolean, onToggle: (name: string) => void }) => {
    const isSelected = selectedPackages.has(pkg.name);
    return (
        <div className="px-1 py-0.5">
            <div
                onClick={() => !disabled && onToggle(pkg.name)}
                className={cn(
                    "flex items-center p-3 border border-transparent hover:border-terminal-green/20 hover:bg-white/5 transition-all cursor-pointer group select-none",
                    isSelected ? "bg-terminal-green/5 border-terminal-green/30" : "bg-black/20"
                )}
            >
                <div className={cn(
                    "w-4 h-4 border mr-4 flex items-center justify-center transition-all shrink-0",
                    isSelected ? "border-terminal-green bg-terminal-green" : "border-zinc-700 group-hover:border-terminal-green/50"
                )}>
                    {isSelected && <Check className="w-3 h-3 text-black" />}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col min-w-0">
                            <span
                                className="text-sm font-mono truncate transition-colors font-bold"
                                style={{ color: isSelected ? '#FFFFFF' : (pkg.is_system ? '#cedc00' : '#E0F7FA') }}
                            >
                                {pkg.label || smartFormatPackage(pkg.name)}
                            </span>
                            <span className={cn(
                                "text-[10px] font-mono truncate transition-colors",
                                isSelected ? "text-white/50" : "text-zinc-600 group-hover:text-zinc-500"
                            )}>
                                {pkg.name}
                            </span>
                        </div>
                        {/* Tags */}
                        <div className="flex gap-2 shrink-0">
                            {pkg.is_disabled && <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono tracking-tight">DISABLED</span>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


function FilterTab({ active, label, icon: Icon, onClick, disabled, variant = 'default' }: any) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "flex items-center gap-2 px-4 py-2.5 border transition-all shrink-0 font-mono text-[10px] tracking-widest relative outline-none",
                active
                    ? (variant === 'danger' ? "bg-red-500/10 border-red-500/40 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)]" :
                        variant === 'cyan' ? "bg-terminal-cyan/10 border-terminal-cyan/40 text-terminal-cyan shadow-[0_0_15px_rgba(206,220,0,0.1)]" :
                            "bg-terminal-green/10 border-terminal-green/40 text-terminal-green shadow-[0_0_15px_rgba(34,197,94,0.1)]")
                    : "bg-zinc-950/50 border-zinc-700 text-zinc-400 hover:border-terminal-green/40 hover:text-white",
                disabled && "opacity-30 cursor-not-allowed"
            )}
        >
            <Icon
                className={cn("w-4 h-4 transition-colors shrink-0", active ? "" : "text-zinc-500 group-hover:text-terminal-green/80")}
                strokeWidth={2.5}
            />
            <span className="uppercase">{label}</span>
        </button>
    );
}
