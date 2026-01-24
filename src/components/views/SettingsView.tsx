import { FolderOpen } from "lucide-react";

interface SettingsViewProps {
    backupPath: string;
}

export function SettingsView({ backupPath }: SettingsViewProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div
                className="relative border border-terminal-green/30 p-10 bg-black/60 max-w-md w-full shadow-[0_0_50px_rgba(34,197,94,0.05)] overflow-hidden"
                style={{ clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 24px 100%, 0 calc(100% - 24px))' }}
            >
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-terminal-green/40" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-terminal-green/40" />

                <div className="text-4xl mb-6 text-terminal-green animate-pulse text-center">📂</div>
                <h2 className="text-xl font-space font-black text-white mb-2 text-center tracking-widest uppercase">
                    LOCAL_STORAGE_NODE
                </h2>
                <div className="text-[10px] text-terminal-green/40 font-mono mb-6 text-center">
                    All encrypted payloads will be routed to this sector.
                </div>

                <div className="bg-black/80 border border-terminal-green/10 p-4 mb-8 flex items-center justify-between group hover:border-terminal-green/40 transition-colors cursor-pointer select-none">
                    <div className="flex items-center overflow-hidden">
                        <FolderOpen className="w-5 h-5 text-terminal-green/60 mr-4 shrink-0" />
                        <span className="text-[11px] font-mono text-terminal-green tracking-tight truncate max-w-[250px]" title={backupPath}>
                            {backupPath}
                        </span>
                    </div>
                </div>

                <button
                    onClick={() => alert("Directory Path selection is currently in UI-only mode. Backend integration pending.")}
                    className="w-full py-4 border border-terminal-green/50 text-terminal-green font-space font-black text-[11px] tracking-[0.3em] hover:bg-terminal-green hover:text-black transition-all"
                >
                    UPDATE_SECTOR_PATH
                </button>
            </div>
        </div>
    );
}
