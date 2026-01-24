import { useState, useMemo } from 'react';
import { useBackups } from '../../hooks/useBackups';
import { cn } from '../../lib/utils';
import { BackupFile } from '../../types/adb';
import { RefreshCw, Trash2, Archive } from 'lucide-react';

interface BackupItemProps {
    file: BackupFile;
    selected: boolean;
    onToggle: (file: BackupFile) => void;
    onDelete?: (file: BackupFile) => void;
}

function BackupItem({ file, selected, onToggle, onDelete }: BackupItemProps) {
    return (
        <div
            onClick={() => onToggle(file)}
            role="button"
            tabIndex={0}
            className={cn(
                "group relative flex items-center justify-between p-4 transition-all duration-300 cursor-pointer overflow-hidden",
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

            <div className="flex flex-col overflow-hidden flex-1 mr-4 relative z-10">
                <span className={cn(
                    "text-[12px] truncate font-space font-black tracking-wider transition-all uppercase",
                    selected ? "text-white" : "text-terminal-green/90 group-hover:text-terminal-green"
                )}>
                    {file.name}
                </span>
                <div className="flex items-center space-x-4 text-[9px] font-mono mt-1.5 pointer-events-none">
                    <span className="text-zinc-500 font-bold uppercase">{file.date.split(' ')[0]}</span>
                    <div className="w-[1px] h-3 bg-terminal-green/20" />
                    <span className="text-terminal-green/60 font-black">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
            </div>

            <div className="flex items-center shrink-0 relative z-10 gap-3">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onDelete) onDelete(file);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 text-red-500 rounded-none transition-all border border-transparent hover:border-red-500/40"
                    title="PURGE_BACKUP"
                >
                    <Trash2 className="w-4 h-4" />
                </button>

                <div className={cn(
                    "w-2.5 h-2.5 transition-all duration-500",
                    selected
                        ? "bg-terminal-green rotate-45 shadow-[0_0_10px_#00ff41]"
                        : "bg-terminal-green/10 group-hover:bg-terminal-green/40"
                )} />
            </div>
        </div>
    );
}

interface RestoreModuleProps {
    selectedBackups: BackupFile[];
    onToggleBackup: (backup: BackupFile) => void;
    onRefresh?: () => void;
    refreshTrigger?: number;
    customPath?: string;
    onDeleteBackup?: (backup: BackupFile) => void;
}

export function RestoreModule({
    selectedBackups,
    onToggleBackup,
    onRefresh,
    refreshTrigger = 0,
    customPath,
    onDeleteBackup
}: RestoreModuleProps) {
    const { backups, loading, error } = useBackups(refreshTrigger, customPath);
    const [search, setSearch] = useState('');

    const filteredBackups = useMemo(() =>
        backups.filter(b => b.name.toLowerCase().includes(search.toLowerCase())),
        [backups, search]
    );

    const isSelected = (backup: BackupFile) => selectedBackups.some(b => b.path === backup.path);

    return (
        <div className="flex flex-col h-full bg-black relative overflow-hidden">
            <div className="p-4 border-b border-terminal-green/20 bg-zinc-950/40 relative z-10">
                <div className="group flex items-center space-x-3 relative">
                    <div className="flex-1 relative group/search">
                        <input
                            type="text"
                            placeholder="LOOKUP_ARCHIVE..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-terminal-green/20 text-terminal-green px-3 py-2 text-[10px] focus:outline-none focus:border-terminal-green/60 placeholder:text-terminal-green/20 font-mono tracking-widest uppercase transition-all"
                        />
                    </div>

                    <div className="flex items-center space-x-3">
                        <div className="flex flex-col items-end">
                            <span className="text-white font-black text-[10px] tabular-nums">
                                {filteredBackups.length}
                            </span>
                            <span className="text-terminal-green/40 text-[7px] font-space font-black tracking-widest">ARCHIVES</span>
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
                        <span className="text-[10px] font-space font-black text-terminal-green/40 tracking-[0.3em] animate-pulse">ARCHIVE_INDEXING...</span>
                    </div>
                ) : error ? (
                    <div className="p-6 text-red-500 text-[10px] font-mono border border-red-500/20 bg-red-500/5 uppercase tracking-widest">
                        CRIT_ERROR_LINK_FAILED // {error}
                    </div>
                ) : filteredBackups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 opacity-20">
                        <Archive className="w-12 h-12 text-terminal-green mb-4" />
                        <div className="text-center text-terminal-green text-[10px] font-space font-black uppercase tracking-[0.4em]">Vault is empty</div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredBackups.map((file) => (
                            <BackupItem
                                key={file.path}
                                file={file}
                                selected={isSelected(file)}
                                onToggle={onToggleBackup}
                                onDelete={onDeleteBackup}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
