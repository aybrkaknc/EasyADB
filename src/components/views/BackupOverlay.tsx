import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ProgressState } from '../../types/adb';
import { X, ShieldCheck, Zap, Terminal } from 'lucide-react';
import { cn } from '../../lib/utils';

interface BackupOverlayProps {
    progress: ProgressState;
    onClose?: () => void;
    onCancel?: () => void;
}

export function BackupOverlay({ progress, onClose }: BackupOverlayProps) {
    const isFinished = progress.currentTask === "Sequence Complete";
    const [countdown, setCountdown] = useState(10);

    // Countdown Timer Logic
    useEffect(() => {
        if (!isFinished || !progress.isActive) {
            setCountdown(10);
            return;
        }

        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onClose?.();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isFinished, progress.isActive, onClose]);

    // ESC to close
    useEffect(() => {
        if (!progress.isActive || !isFinished) return;

        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose?.();
        };

        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [progress.isActive, isFinished, onClose]);

    if (!progress.isActive) return null;

    const rawPercentage = Math.round((progress.current / progress.total) * 100) || 0;
    const percentage = (!isFinished && rawPercentage >= 100) ? 99 : rawPercentage;

    const appName = isFinished ? "OPERATION SUCCESSFUL" : (progress.currentTask.split(':').pop()?.trim() || "Initializing");

    const handleBackdropClick = () => {
        if (isFinished) {
            onClose?.();
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleBackdropClick}
                className={cn(
                    "fixed inset-0 z-[200] flex items-center justify-center overflow-hidden transition-all duration-700",
                    isFinished ? "bg-black/95 cursor-pointer" : "bg-black/90 backdrop-blur-3xl"
                )}
            >
                {/* 1. LAYER: THE GHOST MATRIX (Arka Plan) */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none overflow-hidden">
                    <div className="flex justify-around w-full h-full font-mono text-[8px] text-terminal-green animate-matrix-rain">
                        {Array.from({ length: 30 }).map((_, i) => (
                            <div key={i} className="flex flex-col whitespace-nowrap">
                                {Array.from({ length: 20 }).map((_, j) => (
                                    <span key={j} className="my-1">
                                        {Math.random().toString(16).substring(2, 12).toUpperCase()}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Scanline Global Effect */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[size:100%_2px,2px_100%] pointer-events-none z-50 opacity-30" />

                {/* 2. LAYER: THE HUD CORE (Merkez) */}
                <div className="relative z-10 flex flex-col items-center">

                    {/* Tactical Hud Container */}
                    <div className="relative p-8 flex flex-col items-center">
                        {/* THE CORNER BRACKETS */}
                        <div className="absolute inset-x-0 inset-y-0 pointer-events-none">
                            <CornerBracket position="top-left" />
                            <CornerBracket position="top-right" />
                            <CornerBracket position="bottom-left" />
                            <CornerBracket position="bottom-right" />
                        </div>

                        {/* Main Progress Ring Container */}
                        <div className="relative w-56 h-56 flex items-center justify-center">

                            {/* Rotating Scanning Ring (Active HUD) */}
                            {!isFinished && (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                                    className="absolute inset-[-12px] border-2 border-transparent border-t-terminal-green/30 border-l-terminal-green/10 rounded-full"
                                />
                            )}

                            {!isFinished && (
                                <motion.div
                                    animate={{ rotate: -360 }}
                                    transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
                                    className="absolute inset-[-4px] border border-dashed border-terminal-green/10 rounded-full"
                                />
                            )}

                            {/* Inner Progress Circle */}
                            <svg className="w-48 h-48 -rotate-90 relative">
                                <circle
                                    cx="96"
                                    cy="96"
                                    r="85"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    className="text-terminal-green/5"
                                />
                                <motion.circle
                                    cx="96"
                                    cy="96"
                                    r="85"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={isFinished ? 1 : 3}
                                    strokeDasharray={534}
                                    initial={{ strokeDashoffset: 534 }}
                                    animate={{ strokeDashoffset: isFinished ? 0 : 534 - (534 * percentage) / 100 }}
                                    transition={{ duration: 0.3, ease: "linear" }}
                                    className={cn(
                                        "text-terminal-green",
                                        isFinished ? "opacity-10" : "drop-shadow-[0_0_15px_rgba(0,255,65,0.5)]"
                                    )}
                                />
                            </svg>

                            {/* Center Text & Glitch */}
                            <div
                                className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center"
                                onClick={(e) => isFinished && e.stopPropagation()}
                            >
                                <motion.div
                                    key={isFinished ? 'done' : 'loading'}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="flex flex-col items-center"
                                >
                                    <span className={cn(
                                        "font-space font-black tracking-tighter transition-colors duration-300",
                                        isFinished
                                            ? "text-3xl text-terminal-green drop-shadow-[0_0_20px_#00ff41] animate-glitch"
                                            : "text-5xl text-white"
                                    )}>
                                        {isFinished ? "SEQUENCE_OK" : `${percentage}%`}
                                    </span>
                                </motion.div>
                            </div>
                        </div>

                        {/* MOVED: App Name / Payload Label (Below the Ring) */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-8 flex items-center gap-2 px-4 py-1.5 bg-terminal-green/5 border border-terminal-green/10"
                        >
                            {isFinished ? <ShieldCheck className="w-3.5 h-3.5 text-terminal-green" /> : <Zap className="w-3.5 h-3.5 text-terminal-green animate-pulse" />}
                            <span className="text-[10px] font-mono text-terminal-green uppercase tracking-[0.2em] max-w-[300px] truncate font-bold">
                                {appName}
                            </span>
                        </motion.div>
                    </div>

                    {/* 3. LAYER: OPERATIONAL FEED (Alt Panel) */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 w-[450px]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="border border-terminal-green/20 bg-zinc-950/40 backdrop-blur-md p-4 relative overflow-hidden group shadow-2xl">
                            {/* CRT Scanline */}
                            <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,255,65,0.02)_50%)] bg-[size:100%_4px] pointer-events-none" />

                            <div className="flex items-center justify-between mb-3 border-b border-terminal-green/10 pb-2">
                                <div className="flex items-center gap-2">
                                    <Terminal className="w-3 h-3 text-terminal-green/60" />
                                    <span className="text-[9px] font-mono text-terminal-green/40 uppercase tracking-[0.2em]">Live Data Stream</span>
                                </div>
                                <span className="text-[8px] font-mono text-terminal-green/20 animate-pulse">HUB_SYNC_ACTIVE</span>
                            </div>

                            <div className="space-y-1 h-32 overflow-hidden font-mono text-[9px]">
                                {progress.total > 1 ? (
                                    // BATCH MODE: Checklist view
                                    <>
                                        {/* Completed Items */}
                                        {(progress.completedItems || []).slice(-5).map((item, idx) => (
                                            <p key={item + idx} className="text-terminal-green flex items-center justify-between opacity-60">
                                                <span className="flex items-center gap-2">
                                                    <span className="text-terminal-green/20">{(idx + 1).toString().padStart(2, '0')}</span>
                                                    <span>{item}</span>
                                                </span>
                                                <span className="text-[10px]">✓</span>
                                            </p>
                                        ))}

                                        {/* Current Task */}
                                        {!isFinished && (
                                            <p className="text-terminal-green flex items-center justify-between animate-pulse">
                                                <span className="flex items-center gap-2">
                                                    <span className="text-terminal-green/20">{((progress.completedItems?.length || 0) + 1).toString().padStart(2, '0')}</span>
                                                    <span className="font-bold">PROCESSING: {progress.currentTask}</span>
                                                </span>
                                                <span className="animate-spin text-[8px]">/</span>
                                            </p>
                                        )}

                                        {isFinished && (
                                            <p className="text-terminal-green font-bold mt-2">
                                                {">"} ALL TASKS COMPLETED SUCCESSFULLY.
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    // SINGLE MODE: Technical Log view
                                    <>
                                        <p className="text-terminal-green/80 flex items-start gap-2">
                                            <span className="text-terminal-green/20">01</span>
                                            <span className={isFinished ? "text-terminal-green" : "animate-pulse"}>
                                                {isFinished ? "> STATUS: SEQUENCE_TERMINATED_SUCCESS" : `> CMD: PULL_STREAM :: ${progress.currentTask}`}
                                            </span>
                                        </p>
                                        <p className="text-terminal-green/60 flex items-start gap-2 italic">
                                            <span className="text-terminal-green/20">02</span>
                                            <span className="truncate">{progress.detail || "Allocating virtual bridge nodes..."}</span>
                                        </p>
                                        <p className="text-terminal-green/40 flex items-start gap-2">
                                            <span className="text-terminal-green/20">03</span>
                                            <span>
                                                {isFinished ? "INTEGRITY_LEVEL: 100% SECURE" : `UNIT_STATE: ${progress.current} / ${progress.total} SECTORS`}
                                            </span>
                                        </p>
                                        <p className="text-terminal-green/30 flex items-start gap-2">
                                            <span className="text-terminal-green/20">04</span>
                                            <span>PROTOCOL: ADB/USB_TUNNEL_LINK_STABLE</span>
                                        </p>
                                        <p className="text-terminal-green/20 flex items-start gap-2">
                                            <span className="text-terminal-green/20">05</span>
                                            <span className="truncate">MEMORY_SECTOR: 0x{Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase()} // BUF_SYNC</span>
                                        </p>
                                        <p className="text-terminal-green/10 flex items-start gap-2">
                                            <span className="text-terminal-green/20">06</span>
                                            <span>THREAD_PID: {Math.floor(Math.random() * 9000) + 1000} // PRIORITY: REALTIME</span>
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* 4. LAYER: ACTIONS (Close Button) */}
                    <AnimatePresence>
                        {isFinished && (
                            <motion.button
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                onClick={(e) => { e.stopPropagation(); onClose?.(); }}
                                className="mt-10 group relative px-10 py-3 bg-terminal-green text-black font-space font-black text-[12px] tracking-[0.5em] uppercase transition-all overflow-hidden active:scale-95 shadow-[0_0_30px_rgba(34,197,94,0.4)] hover:bg-white hover:text-black"
                                style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))' }}
                            >
                                <div className="relative z-10 flex items-center gap-2">
                                    <X className="w-3.5 h-3.5" />
                                    CLOSE ({countdown}s)
                                </div>
                                {/* Glitch background on button hover */}
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute inset-0 translate-x-full group-hover:-translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

function CornerBracket({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
    const styles: Record<string, string> = {
        'top-left': 'top-0 left-0 border-t border-l',
        'top-right': 'top-0 right-0 border-t border-r',
        'bottom-left': 'bottom-0 left-0 border-b border-l',
        'bottom-right': 'bottom-0 right-0 border-b border-r',
    };

    return (
        <div
            className={cn(
                "absolute w-6 h-6 border-terminal-green/30 transition-all duration-1000",
                styles[position],
                "group-hover:w-8 group-hover:h-8 group-hover:border-terminal-green/60"
            )}
        />
    );
}
