import { BackupFile } from "../../types/adb";

interface RestoreConfirmationViewProps {
    selectedBackups: BackupFile[];
    isProcessing: boolean;
    onExecute: () => void;
}

export function RestoreConfirmationView({
    selectedBackups,
    isProcessing,
    onExecute
}: RestoreConfirmationViewProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div
                className="relative border border-terminal-green/30 p-10 bg-black/60 max-w-md w-full shadow-[0_0_50px_rgba(34,197,94,0.05)] overflow-hidden"
                style={{ clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 24px 100%, 0 calc(100% - 24px))' }}
            >
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-terminal-green/40" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-terminal-green/40" />

                <div className="text-4xl mb-6 text-terminal-green animate-pulse text-center">🔄</div>
                <h2 className="text-xl font-space font-black text-white mb-6 text-center tracking-widest">
                    {selectedBackups.length}_DATA_PAYLOADS
                </h2>

                <div className="text-terminal-green/40 text-[10px] font-mono mb-8 bg-black/40 p-4 border border-terminal-green/10 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-terminal-green/10">
                    {selectedBackups.map(b => (
                        <div key={b.path} className="py-2 border-b border-terminal-green/5 last:border-0 flex justify-between items-center">
                            <span className="truncate pr-4 uppercase tracking-wider">{b.name}</span>
                            <span className="text-terminal-green px-1 bg-terminal-green/10 tabular-nums">{(b.size / 1024 / 1024).toFixed(1)}MB</span>
                        </div>
                    ))}
                </div>

                <button
                    onClick={onExecute}
                    disabled={isProcessing}
                    className="w-full py-4 bg-terminal-green text-black font-space font-black text-[11px] tracking-[0.3em] hover:bg-terminal-green/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isProcessing ? "RESTORING_DATA..." : "EXECUTE_BATCH_RESTORE"}
                </button>
            </div>
        </div>
    );
}
