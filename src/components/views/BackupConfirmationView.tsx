import { PackageInfo } from "../../types/adb";
import { formatSize } from "../../lib/utils";

interface BackupConfirmationViewProps {
    selectedPackages: PackageInfo[];
    totalSize: number;
    isProcessing: boolean;
    onExecute: () => void;
}

export function BackupConfirmationView({
    selectedPackages,
    totalSize,
    isProcessing,
    onExecute
}: BackupConfirmationViewProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div
                className="relative border border-terminal-green/30 p-10 bg-black/60 max-w-md w-full shadow-[0_0_50px_rgba(34,197,94,0.05)] overflow-hidden"
                style={{ clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 24px 100%, 0 calc(100% - 24px))' }}
            >
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-terminal-green/40" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-terminal-green/40" />

                <div className="text-4xl mb-6 text-terminal-green animate-pulse text-center">📦</div>
                <h2 className="text-xl font-space font-black text-white mb-2 text-center tracking-widest">
                    {selectedPackages.length}_TARGETS_LOCKED
                </h2>
                <div className="mb-6 py-2 px-4 border border-terminal-green/20 bg-terminal-green/5 text-center">
                    <span className="text-[10px] font-mono text-terminal-green uppercase tracking-widest opacity-60">BIT_SIZE: </span>
                    <span className="text-sm font-mono font-black text-terminal-green drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]">{formatSize(totalSize)}</span>
                </div>

                <div className="text-terminal-green/40 text-[10px] font-mono mb-8 bg-black/40 p-4 border border-terminal-green/10 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-terminal-green/10">
                    {selectedPackages.map(p => (
                        <div key={p.name} className="py-1 flex items-center gap-2">
                            <div className="w-1 h-1 bg-terminal-green/30" />
                            <span className="truncate">{p.name}</span>
                        </div>
                    ))}
                </div>

                <button
                    onClick={onExecute}
                    disabled={isProcessing}
                    className="w-full py-4 bg-terminal-green text-black font-space font-black text-[11px] tracking-[0.3em] hover:bg-terminal-green/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isProcessing ? "INITIALIZING_PAYLOAD..." : "EXECUTE_BATCH_BACKUP"}
                </button>
            </div>
        </div>
    );
}
