import { useState } from "react";
import { usePackages, AppPackage } from "../hooks/usePackages";
import { useBackups, BackupFile } from "../hooks/useBackups";
import { cn } from "../lib/utils";

interface SidebarProps {
    deviceId?: string;
    // App Mode Props
    appMode: 'backup' | 'restore';
    setAppMode: (mode: 'backup' | 'restore') => void;

    // Backup Mode Props
    selectedPackages: AppPackage[];
    onTogglePackage: (pkg: AppPackage) => void;

    // Restore Mode Props
    selectedBackups: BackupFile[];
    onToggleBackup: (file: BackupFile) => void;

    refreshBackupsTrigger?: number;
    onRefresh?: () => void;

    className?: string;
}

export function Sidebar({
    deviceId,
    appMode,
    setAppMode,
    selectedPackages,
    onTogglePackage,
    selectedBackups,
    onToggleBackup,
    refreshBackupsTrigger = 0,
    onRefresh,
    className
}: SidebarProps) {
    // Only pass trigger if in backup mode? Or always?
    // refreshBackupsTrigger is passed from parent. Parent controls it via onRefresh.
    // Ideally we should have separate triggers or a single one that forces update.
    // Logic: 
    // If appMode == 'backup', usePackages should react to trigger.
    // If appMode == 'restore', useBackups should react to trigger.

    // BUT `refreshBackupsTrigger` name implies it is for backups.
    // Let's assume the parent passes the RELEVANT trigger based on mode, or pass both?
    // Simpler: Just pass `refreshTrigger` generic prop.

    const { packages, loading: loadingApps, error: errorApps } = usePackages(deviceId, refreshBackupsTrigger);
    const { backups, loading: loadingBackups, error: errorBackups } = useBackups(refreshBackupsTrigger);

    const [search, setSearch] = useState("");

    // FILTER LOGIC
    const filteredPackages = packages.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
    );
    const filteredBackups = backups.filter(b =>
        b.name.toLowerCase().includes(search.toLowerCase())
    );

    // SELECTION HELPERS
    const isAppSelected = (pkg: AppPackage) => selectedPackages.some(p => p.name === pkg.name);
    const isBackupSelected = (file: BackupFile) => selectedBackups.some(b => b.path === file.path);

    const formatAppName = (packageName: string) => {
        const name = packageName.split('.').pop() || packageName;
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    const loading = appMode === 'backup' ? loadingApps : loadingBackups;
    const error = appMode === 'backup' ? errorApps : errorBackups;

    return (
        <aside className={cn("flex flex-col w-80 border-r border-terminal-green/30 bg-black/60 backdrop-blur-md h-full", className)}>

            {/* Tab-Style Mode Switcher */}
            <div className="flex border-b border-terminal-green/20">
                <button
                    onClick={() => setAppMode('backup')}
                    className={cn(
                        "flex-1 py-1.5 text-[10px] font-bold tracking-widest transition-all relative overflow-hidden",
                        appMode === 'backup'
                            ? "text-black bg-terminal-green"
                            : "text-terminal-green/50 hover:bg-terminal-green/10 hover:text-terminal-green"
                    )}
                >
                    <span className="relative z-10 font-space font-black tracking-widest text-[11px]">BACKUP</span>
                    {appMode === 'backup' && (
                        <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-r-[8px] border-t-black/20 border-r-transparent"></div>
                    )}
                </button>
                <div className="w-[1px] bg-terminal-green/20"></div>
                <button
                    onClick={() => setAppMode('restore')}
                    className={cn(
                        "flex-1 py-1.5 text-[10px] font-bold tracking-widest transition-all relative overflow-hidden",
                        appMode === 'restore'
                            ? "text-black bg-terminal-green"
                            : "text-terminal-green/50 hover:bg-terminal-green/10 hover:text-terminal-green"
                    )}
                >
                    <span className="relative z-10 font-space font-black tracking-widest text-[11px]">RESTORE</span>
                    {appMode === 'restore' && (
                        <div className="absolute top-0 left-0 w-0 h-0 border-t-[8px] border-l-[8px] border-t-black/20 border-l-transparent"></div>
                    )}
                </button>
            </div>
            {/* Minimal Sidebar Header */}
            <div className="p-3">
                <div className="group flex items-center space-x-2 relative border-b border-terminal-green/60 pb-1">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="SEARCH..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-transparent text-terminal-green/60 hover:text-terminal-green focus:text-terminal-green text-[10px] py-1 focus:outline-none transition-all placeholder:text-terminal-green/20 font-mono tracking-widest uppercase"
                        />
                    </div>

                    <div className="flex items-center space-x-2">
                        {/* Result Count */}
                        <span className="text-terminal-green/60 text-[10px] font-mono whitespace-nowrap">
                            {appMode === 'backup' ? filteredPackages.length : filteredBackups.length}
                        </span>

                        {/* Selection Count */}
                        <span className="text-[10px] text-terminal-green/60 font-mono whitespace-nowrap">
                            {appMode === 'backup'
                                ? (selectedPackages.length > 0 ? `${selectedPackages.length} SEL` : "")
                                : (selectedBackups.length > 0 ? `${selectedBackups.length} SEL` : "")
                            }
                        </span>

                        {/* Refresh Button - Visible on hover */}
                        <button
                            onClick={onRefresh}
                            className="text-terminal-green/60 hover:text-terminal-green hover:animate-spin transition-all p-1 mr-1"
                            title="Refresh List"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-48 space-y-4">
                        <div className="w-8 h-8 border-2 border-terminal-green/30 border-t-terminal-green rounded-full animate-spin"></div>
                        <span className="text-xs text-terminal-green/50 animate-pulse">SCANNING...</span>
                    </div>
                ) : error ? (
                    <div className="p-4 text-terminal-red text-xs border border-terminal-red/20 bg-terminal-red/5 mt-4">
                        ERROR: {error}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {appMode === 'backup' ? (
                            // APP LIST RENDER
                            filteredPackages.length === 0 ? (
                                <div className="text-center py-8 text-terminal-green/30 text-xs italic">NO_MATCH_FOUND</div>
                            ) : (
                                filteredPackages.map((pkg) => {
                                    const selected = isAppSelected(pkg);
                                    return (
                                        <div
                                            key={pkg.name}
                                            onClick={() => onTogglePackage(pkg)}
                                            className={cn(
                                                "group flex items-center justify-between p-2 hover:bg-terminal-green/10 cursor-pointer border border-transparent hover:border-terminal-green/20 transition-all",
                                                selected
                                                    ? "bg-terminal-green/20 border-terminal-green/50 shadow-[0_0_10px_rgba(0,255,65,0.1)]"
                                                    : ""
                                            )}
                                        >
                                            <div className="flex flex-col overflow-hidden">
                                                <span className={cn(
                                                    "text-xs truncate font-space font-bold transition-colors",
                                                    selected ? "text-white" : "text-terminal-green/90 group-hover:text-terminal-green"
                                                )}>
                                                    {formatAppName(pkg.name)}
                                                </span>
                                                <span className="text-[10px] text-terminal-green/50 truncate">
                                                    {pkg.name}
                                                </span>
                                            </div>
                                            <div className={cn(
                                                "w-2 h-2 rounded-full transition-all ml-2 shrink-0",
                                                selected
                                                    ? "bg-terminal-green shadow-[0_0_5px_rgba(0,255,65,0.8)]"
                                                    : "bg-terminal-green/20 group-hover:bg-terminal-green"
                                            )}></div>
                                        </div>
                                    );
                                })
                            )
                        ) : (
                            // BACKUP LIST RENDER
                            filteredBackups.length === 0 ? (
                                <div className="text-center py-8 text-terminal-green/30 text-xs italic">NO_BACKUPS_FOUND</div>
                            ) : (
                                filteredBackups.map((file) => {
                                    const selected = isBackupSelected(file);
                                    return (
                                        <div
                                            key={file.path}
                                            onClick={() => onToggleBackup(file)}
                                            className={cn(
                                                "group flex items-center justify-between p-2 hover:bg-terminal-green/10 cursor-pointer border border-transparent hover:border-terminal-green/20 transition-all",
                                                selected
                                                    ? "bg-terminal-green/20 border-terminal-green/50 shadow-[0_0_10px_rgba(0,255,65,0.1)]"
                                                    : ""
                                            )}
                                        >
                                            <div className="flex flex-col overflow-hidden">
                                                <span className={cn(
                                                    "text-xs truncate font-space font-bold transition-colors",
                                                    selected ? "text-white" : "text-terminal-green/90 group-hover:text-terminal-green"
                                                )}>
                                                    {file.name}
                                                </span>
                                                <div className="flex items-center space-x-2 text-[10px] text-terminal-green/50">
                                                    <span>{file.date.split(" ")[0]}</span>
                                                    <span className="opacity-50">|</span>
                                                    <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                                                </div>
                                            </div>
                                            <div className={cn(
                                                "w-2 h-2 rounded-full transition-all ml-2 shrink-0",
                                                selected
                                                    ? "bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]" // Blue for backups? or consistent green? Let's keep green for consistency but different shape/style? Keeping green.
                                                    : "bg-terminal-green/20 group-hover:bg-terminal-green"
                                            )}></div>
                                        </div>
                                    );
                                })
                            )
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
}
