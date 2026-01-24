import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ProgressState } from "../types/adb";
import { analyzeError } from "../lib/errorAnalyzer";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface LogEntry {
    id: number;
    message: string;
    type: "info" | "success" | "error" | "warning";
    timestamp: string;
}

interface LogPanelProps {
    logs: LogEntry[];
    isOpen: boolean;
    onToggle: () => void;
    className?: string;
    progress?: ProgressState;
}

export function LogPanel({ logs, isOpen, onToggle, className, progress }: LogPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const latestLog = logs[logs.length - 1];

    const handleAction = async (cmd: string) => {
        try {
            // If it's a multi-command, we split and run
            if (cmd === "adb kill-server && adb start-server") {
                await invoke('run_adb_command', { command: 'kill-server' });
                await invoke('run_adb_command', { command: 'start-server' });
            } else {
                await invoke('run_adb_command', { command: cmd });
            }
        } catch (err) {
            console.error("Failed to execute fix:", err);
        }
    };

    // Auto-scroll to bottom when expanded
    useEffect(() => {
        if (isOpen && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, isOpen]);

    const isProgressActive = progress?.isActive ?? false;

    return (
        <div
            className={cn(
                "flex flex-col bg-black border-t border-terminal-green/30 transition-all duration-300 ease-in-out shrink-0 z-50 overflow-hidden",
                isOpen ? "h-64 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]" : "h-8 hover:bg-terminal-green/5 cursor-pointer",
                className
            )}
        >
            {/* Header / Status Bar */}
            <div
                className="flex items-center justify-between px-3 py-0 h-8 relative overflow-hidden shrink-0"
                onClick={onToggle}
            >
                {/* Background Pulse Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-terminal-green/0 via-terminal-green/5 to-terminal-green/0 opacity-20 pointer-events-none"></div>

                {/* Progress Bar Line (Collapsed Only) */}
                {!isOpen && isProgressActive && progress && (
                    <motion.div
                        className="absolute bottom-0 left-0 h-[2px] bg-terminal-green shadow-[0_0_8px_rgba(34,197,94,0.8)] z-10"
                        initial={{ width: 0 }}
                        animate={{
                            width: progress.isIndeterminate ? "30%" : `${progress.percent ?? 0}%`,
                            x: progress.isIndeterminate ? ["-100%", "400%"] : 0
                        }}
                        transition={progress.isIndeterminate ? {
                            repeat: Infinity,
                            duration: 1.2,
                            ease: "easeInOut"
                        } : {
                            type: "tween",
                            ease: "circOut",
                            duration: 0.3
                        }}
                    />
                )}

                <div className="flex items-center overflow-hidden flex-1 mr-4">
                    <div className={cn(
                        "w-1.5 h-1.5 rounded-full mr-2 shrink-0 transition-colors",
                        latestLog?.type === 'error' ? "bg-red-500 animate-pulse" : "bg-terminal-green animate-pulse"
                    )}></div>

                    <span className="text-[10px] text-terminal-green font-space font-black tracking-[0.2em] mr-3 whitespace-nowrap opacity-70">
                        {isOpen ? "SYSTEM_LOG" : "STATUS:"}
                    </span>

                    {/* Collapsed View: Latest Message or Progress Info */}
                    {!isOpen && (
                        <div className="flex-1 truncate flex items-center">
                            {isProgressActive && progress ? (
                                <span className="font-mono text-[11px] text-terminal-green animate-pulse flex items-center">
                                    <span className="mr-2">&gt;&gt;</span>
                                    {progress.currentTask}
                                    {progress.percent !== undefined && (
                                        <span className="ml-2 font-bold bg-terminal-green/10 px-1 rounded">
                                            {progress.percent}%
                                        </span>
                                    )}
                                    {progress.detail && (
                                        <span className="ml-2 opacity-40 text-[10px] hidden sm:inline">
                                            [{progress.detail}]
                                        </span>
                                    )}
                                </span>
                            ) : (
                                latestLog && (
                                    <motion.span
                                        key={latestLog.id}
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={cn(
                                            "font-mono text-xs truncate transition-colors",
                                            latestLog.type === "error" && "text-red-500",
                                            latestLog.type === "success" && "text-terminal-green",
                                            latestLog.type === "warning" && "text-yellow-500",
                                            latestLog.type === "info" && "text-terminal-green/80"
                                        )}
                                    >
                                        {latestLog.message}
                                    </motion.span>
                                )
                            )}
                        </div>
                    )}

                    {!isOpen && !latestLog && !isProgressActive && (
                        <span className="text-xs text-terminal-green/30 font-mono italic">Ready...</span>
                    )}
                </div>

                {/* Toggle Icon */}
                <div className="text-terminal-green/50 text-[10px] font-space font-bold hover:text-terminal-green">
                    {isOpen ? "[v] MINIMIZE" : "[^] EXPAND"}
                </div>
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1 bg-black/40 shadow-inner"
                    >
                        {logs.map((log) => {
                            const smartError = log.type === "error" ? analyzeError(log.message) : null;

                            return (
                                <div key={log.id} className="space-y-1">
                                    <div
                                        className={cn(
                                            "flex items-start opacity-80 hover:opacity-100 transition-opacity p-0.5",
                                            log.type === "error" && "text-red-500 bg-red-500/5",
                                            log.type === "success" && "text-terminal-green",
                                            log.type === "warning" && "text-yellow-500",
                                            log.type === "info" && "text-terminal-green/70"
                                        )}
                                    >
                                        <span className="mr-3 text-white/20 select-none w-16 shrink-0 text-right">[{log.timestamp}]</span>
                                        <span className="break-all">{log.type === "success" ? ">> " : ""}{log.message}</span>
                                    </div>

                                    {/* Smart Error Action Block */}
                                    {smartError && (
                                        <div className="ml-20 mr-4 mt-1 mb-3 p-3 bg-red-950/20 border border-red-500/30 rounded border-l-4 border-l-red-500 flex flex-col gap-2">
                                            <div className="flex items-center gap-2 text-red-400 font-space font-bold text-[10px] tracking-wider">
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                                {smartError.title}
                                            </div>
                                            <div className="text-[10px] text-red-200/70 leading-relaxed">
                                                {smartError.description}
                                            </div>
                                            {smartError.actionLabel && (
                                                <button
                                                    onClick={() => handleAction(smartError.actionCommand!)}
                                                    className="w-fit mt-1 px-3 py-1 bg-red-500 text-black text-[9px] font-space font-bold rounded hover:bg-red-400 transition-all flex items-center gap-2"
                                                >
                                                    <RefreshCw className="w-3 h-3" />
                                                    {smartError.actionLabel}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
