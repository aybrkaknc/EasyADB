import { useState, useMemo } from 'react';
import { usePackages } from '../../hooks/usePackages';
import { useBackups } from '../../hooks/useBackups';
import { cn } from '../../lib/utils';
import { PackageInfo, BackupFile } from '../../types/adb';
import { RefreshCw, Package, CheckSquare, Check, Square, Layers, ShieldAlert, Box, Search, RotateCcw, Trash2, Download } from 'lucide-react';
import { smartFormatPackage } from '../../data/package-db';

interface PackageItemProps {
    pkg: PackageInfo;
    selected: boolean;
    onToggle: (pkg: PackageInfo) => void;
}

function PackageItem({ pkg, selected, onToggle }: PackageItemProps) {
    const displayName = pkg.label || smartFormatPackage(pkg.name);

    return (
        <div
            onClick={() => onToggle(pkg)}
            className={cn(
                "flex items-center p-3 mb-1 border border-transparent hover:border-terminal-green/20 hover:bg-white/5 transition-all cursor-pointer group select-none",
                selected && "bg-terminal-green/5 border-terminal-green/30"
            )}
        >
            <div className={cn(
                "w-4 h-4 border mr-4 flex items-center justify-center transition-all",
                selected ? "border-terminal-green bg-terminal-green" : "border-zinc-700 group-hover:border-terminal-green/50"
            )}>
                {selected && <Check className="w-3 h-3 text-black" />}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-0">
                        <span
                            className="text-sm font-mono truncate transition-colors font-bold"
                            style={{ color: selected ? '#FFFFFF' : (pkg.is_system ? '#cedc00' : '#E0F7FA') }}
                        >
                            {displayName}
                        </span>
                        <span className={cn(
                            "text-[10px] font-mono truncate transition-colors",
                            selected ? "text-white/50" : "text-zinc-600 group-hover:text-zinc-500"
                        )}>
                            {pkg.name}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ArchiveItem({ file, selected, onToggle, onDelete }: { file: BackupFile, selected: boolean, onToggle: (f: BackupFile) => void, onDelete?: (f: BackupFile) => void }) {
    return (
        <div
            onClick={() => onToggle(file)}
            className={cn(
                "flex items-center p-3 mb-1 border border-transparent hover:border-terminal-green/20 hover:bg-white/5 transition-all cursor-pointer group select-none",
                selected && "bg-terminal-green/5 border-terminal-green/30"
            )}
        >
            <div className={cn(
                "w-4 h-4 border mr-4 flex items-center justify-center transition-all",
                selected ? "border-terminal-green bg-terminal-green" : "border-zinc-700 group-hover:border-terminal-green/50"
            )}>
                {selected && <Check className="w-3 h-3 text-black" />}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-0">
                        <span className={cn(
                            "text-sm font-mono truncate transition-colors",
                            selected ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
                        )}>
                            {file.name}
                        </span>
                        <div className="flex items-center space-x-4 text-[9px] font-mono mt-1 opacity-60">
                            <span className="uppercase">{file.date.split(' ')[0]}</span>
                            <div className="w-[1px] h-3 bg-terminal-green/20" />
                            <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                        </div>
                    </div>
                    {/* Delete Action */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onDelete) onDelete(file);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 text-red-500 transition-all border border-transparent hover:border-red-500/40"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

interface BackupModuleProps {
    deviceId?: string;
    selectedPackages: PackageInfo[];
    onTogglePackage: (pkg: PackageInfo) => void;
    onToggleSelectAll: (pkgs: PackageInfo[]) => void;
    onRefresh?: () => void;
    refreshTrigger?: number;
    // Restore specific props
    selectedBackups: BackupFile[];
    onToggleBackup: (backup: BackupFile) => void;
    onDeleteBackup?: (backup: BackupFile) => void;
    customBackupPath?: string;
    onExecuteBackup?: () => void;
    onExecuteRestore?: () => void;
    onBatchDeleteBackups?: (files: BackupFile[]) => void;
    onToggleSelectAllBackups?: (files: BackupFile[]) => void;
    isProcessing?: boolean;
    totalSize?: number;
}

type BackupFilter = 'restore' | 'all' | 'system' | 'user';

export function BackupModule({
    deviceId,
    selectedPackages,
    onTogglePackage,
    onToggleSelectAll,
    onRefresh,
    refreshTrigger = 0,
    selectedBackups,
    onToggleBackup,
    onDeleteBackup,
    customBackupPath,
    onExecuteBackup,
    onExecuteRestore,
    onBatchDeleteBackups,
    onToggleSelectAllBackups,
    isProcessing,
    totalSize = 0
}: BackupModuleProps) {
    const { packages, loading: packagesLoading, error: packagesError } = usePackages(deviceId, refreshTrigger);
    const { backups, loading: backupsLoading, error: backupsError } = useBackups(refreshTrigger, customBackupPath);

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<BackupFilter>('all');

    const loading = filter === 'restore' ? backupsLoading : packagesLoading;
    const error = filter === 'restore' ? backupsError : packagesError;

    const filteredPackages = useMemo(() =>
        packages.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
            let matchesFilter = true;
            if (filter === 'system') matchesFilter = p.is_system === true;
            if (filter === 'user') matchesFilter = p.is_system === false;
            return matchesSearch && matchesFilter;
        }), [packages, search, filter]);

    const filteredBackups = useMemo(() =>
        backups.filter(b => b.name.toLowerCase().includes(search.toLowerCase())),
        [backups, search]);

    const isPackageSelected = (pkg: PackageInfo) => selectedPackages.some(p => p.name === pkg.name);
    const isBackupSelected = (file: BackupFile) => selectedBackups.some(b => b.path === file.path);

    const allPackagesSelected = filteredPackages.length > 0 && filteredPackages.every(isPackageSelected);
    const allBackupsSelected = filteredBackups.length > 0 && filteredBackups.every(isBackupSelected);

    return (
        <div className="flex flex-col h-full bg-black relative overflow-hidden">
            {/* Unified Command Center HUD */}
            <div className="p-6 border-b border-terminal-green/20 bg-zinc-950/20 space-y-4 shrink-0">
                {/* Row 1: Brand & Stats */}
                <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3 mb-2">
                            <Package className="w-6 h-6 text-terminal-green" />
                            <h2 className="text-2xl font-space font-black text-white tracking-[0.2em] uppercase drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                                BACKUP & RESTORE
                            </h2>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 font-mono text-[10px] tracking-widest uppercase">
                            <span className="text-white/80 font-bold">
                                {filter === 'restore' ? `${backups.length} BACKUPS IN ARCHIVE` : `${packages.length} APPS INSTALLED`}
                            </span>
                            <div className="w-1 h-1 bg-terminal-green/30 rounded-full" />
                            <span className="text-terminal-green/60">READY</span>
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
                            onClick={() => setFilter('all')}
                        />
                        <FilterTab
                            active={filter === 'user'}
                            label="USER"
                            icon={Layers}
                            onClick={() => setFilter('user')}
                        />
                        <FilterTab
                            active={filter === 'system'}
                            label="SYSTEM"
                            icon={ShieldAlert}
                            variant="cyan"
                            onClick={() => setFilter('system')}
                        />
                        <div className="w-px h-6 bg-terminal-green/20 mx-2" />
                        <FilterTab
                            active={filter === 'restore'}
                            label="RESTORE"
                            icon={RotateCcw}
                            variant="default"
                            onClick={() => setFilter('restore')}
                        />
                    </div>

                    {/* Right: Search & Actions */}
                    <div className="flex items-center gap-3">
                        {/* Action Buttons (Appearing left of search) */}
                        {filter === 'restore' && selectedBackups.length > 0 && (
                            <div className="flex items-center gap-2 shrink-0 animate-in fade-in slide-in-from-left-2 duration-300">
                                <button
                                    onClick={() => onBatchDeleteBackups?.(selectedBackups)}
                                    disabled={isProcessing}
                                    className="flex items-center gap-2 px-3 py-2.5 border border-zinc-700 hover:border-red-500/40 text-zinc-400 hover:text-red-400 font-mono text-[10px] transition-all uppercase disabled:opacity-50"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> DELETE
                                </button>
                                <button
                                    onClick={onExecuteRestore}
                                    disabled={isProcessing}
                                    className="flex items-center gap-2 px-3 py-2.5 border border-zinc-700 hover:border-terminal-green/40 text-zinc-400 hover:text-terminal-green font-mono text-[10px] transition-all uppercase disabled:opacity-50"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" /> RESTORE
                                </button>
                            </div>
                        )}

                        {/* Compact Search */}
                        <div className="relative group/search w-48 xl:w-64">
                            <div className="absolute inset-0 bg-terminal-green/5 blur-sm opacity-0 group-focus-within/search:opacity-100 transition-opacity pointer-events-none" />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-terminal-green/40 group-focus-within/search:text-terminal-green transition-colors pointer-events-none" />
                            <input
                                type="text"
                                placeholder={filter === 'restore' ? "SEARCH..." : "FILTER..."}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-zinc-950/50 border border-terminal-green/20 rounded-none text-[10px] font-mono text-terminal-green focus:outline-none focus:border-terminal-green/60 transition-all uppercase tracking-widest relative z-10"
                            />
                        </div>

                        {filter !== 'restore' ? (
                            <button
                                onClick={() => onToggleSelectAll(filteredPackages)}
                                disabled={loading || filteredPackages.length === 0}
                                className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 hover:text-white transition-colors border border-zinc-700 hover:border-terminal-green/40 px-3 py-2.5 shrink-0"
                            >
                                {allPackagesSelected ? <CheckSquare className="w-3.5 h-3.5 text-terminal-green" /> : <Square className="w-3.5 h-3.5" />}
                                {allPackagesSelected ? "DESELECT" : "SELECT ALL"}
                            </button>
                        ) : (
                            <button
                                onClick={() => onToggleSelectAllBackups?.(filteredBackups)}
                                disabled={loading || filteredBackups.length === 0}
                                className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 hover:text-white transition-colors border border-zinc-700 hover:border-terminal-green/40 px-3 py-2.5 shrink-0"
                            >
                                {allBackupsSelected ? <CheckSquare className="w-3.5 h-3.5 text-terminal-green" /> : <Square className="w-3.5 h-3.5" />}
                                {allBackupsSelected ? "DESELECT" : "SELECT ALL"}
                            </button>
                        )}

                        {/* Refresh Button */}
                        <button
                            onClick={onRefresh}
                            disabled={loading}
                            className="group relative px-3 py-2.5 border border-zinc-700 hover:border-terminal-green/40 transition-all outline-none"
                            title="REFRESH LIST"
                        >
                            <RefreshCw
                                className={cn("w-4.5 h-4.5 text-zinc-400 group-hover:text-terminal-green transition-all", loading && "animate-spin text-terminal-green")}
                                strokeWidth={2.5}
                            />
                        </button>



                        {filter !== 'restore' && selectedPackages.length > 0 && (
                            <button
                                onClick={onExecuteBackup}
                                disabled={isProcessing}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-0.75 font-space font-black text-[14px] tracking-[0.2em] transition-all relative overflow-hidden shrink-0",
                                    isProcessing
                                        ? "bg-zinc-950 text-zinc-500 border border-zinc-800 cursor-not-allowed opacity-50"
                                        : "bg-terminal-green text-black border border-terminal-green/50 hover:bg-white hover:text-black active:scale-95 shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                                )}
                            >
                                <div className="flex flex-col items-start leading-none">
                                    <span className="uppercase">{isProcessing ? "PROCESSING..." : "START BACKUP"}</span>
                                    {!isProcessing && totalSize > 0 && (
                                        <span className="text-[12px] opacity-70 mt-0.5">{(totalSize / 1024 / 1024).toFixed(2)} MB</span>
                                    )}
                                </div>
                                <Download className={cn("w-3.5 h-3.5 ml-1", isProcessing && "animate-pulse")} />
                            </button>
                        )}
                    </div>
                </div>


            </div>

            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin relative z-10 bg-zinc-950/5">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 space-y-5">
                        <div className="w-12 h-12 border-2 border-terminal-green/20 border-t-terminal-green rounded-full animate-spin shadow-[0_0_15px_rgba(0,255,65,0.2)]" />
                        <span className="text-[10px] font-space font-black text-terminal-green/40 tracking-[0.3em] animate-pulse uppercase">Scanning {filter === 'restore' ? 'Archive' : 'Apps'}...</span>
                    </div>
                ) : error ? (
                    <div className="p-6 text-red-500 text-[10px] font-mono border border-red-500/20 bg-red-500/5 uppercase tracking-widest">
                        ERROR: SYNC FAILED // {error}
                    </div>
                ) : (filter === 'restore' ? filteredBackups : filteredPackages).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 opacity-20">
                        <Package className="w-12 h-12 text-terminal-green mb-4" />
                        <div className="text-center text-terminal-green text-[10px] font-space font-black uppercase tracking-[0.4em]">No items found</div>
                    </div>
                ) : (
                    <div className="space-y-2 pb-10">
                        {filter === 'restore' ? (
                            filteredBackups.map(file => (
                                <ArchiveItem key={file.path} file={file} selected={isBackupSelected(file)} onToggle={onToggleBackup} onDelete={onDeleteBackup} />
                            ))
                        ) : (
                            filteredPackages.map(pkg => (
                                <PackageItem key={pkg.name} pkg={pkg} selected={isPackageSelected(pkg)} onToggle={onTogglePackage} />
                            ))
                        )}
                    </div>
                )}
            </div>
        </div >
    );
}

function FilterTab({ active, label, icon: Icon, onClick, variant = 'default' }: any) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-2 px-4 py-2.5 border transition-all shrink-0 font-mono text-[10px] tracking-widest relative outline-none",
                active
                    ? (variant === 'danger' ? "bg-red-500/10 border-red-500/40 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)]" :
                        variant === 'cyan' ? "bg-terminal-cyan/10 border-terminal-cyan/40 text-terminal-cyan shadow-[0_0_15px_rgba(206,220,0,0.1)]" :
                            "bg-terminal-green/10 border-terminal-green/40 text-terminal-green shadow-[0_0_15px_rgba(34,197,94,0.1)]")
                    : "bg-zinc-950/50 border-zinc-700 text-zinc-400 hover:border-terminal-green/40 hover:text-white"
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
