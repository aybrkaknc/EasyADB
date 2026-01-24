import { motion } from 'framer-motion';
import { ProgressState } from '../../types/adb';

interface ProgressBarProps {
    state: ProgressState;
    className?: string;
}

export function ProgressBar({ state, className }: ProgressBarProps) {
    if (!state.isActive) return null;

    const percent = state.percent ?? 0;
    const isIndeterminate = state.isIndeterminate ?? false;

    return (
        <div className={`w-full bg-black/90 border-t border-terminal-green/30 backdrop-blur-md p-2 select-none ${className}`}>
            <div className="flex justify-between items-end mb-1.5 px-0.5">
                <span className="text-[11px] text-terminal-green/90 font-mono truncate max-w-[75%] tracking-tight">
                    <span className="text-terminal-green font-bold mr-2">&gt;</span>
                    {state.currentTask}
                    {state.detail && <span className="opacity-60 ml-2 border-l border-terminal-green/20 pl-2">{state.detail}</span>}
                </span>
                <span className="text-[11px] text-terminal-green font-bold font-mono tracking-wider tabular-nums">
                    [{String(state.current).padStart(2, '0')} / {String(state.total).padStart(2, '0')}]
                    {state.percent !== undefined && ` ${percent}%`}
                </span>
            </div>

            {/* Track */}
            <div className="h-1 w-full bg-terminal-green/10 relative overflow-hidden">
                {/* Fill */}
                <motion.div
                    className="absolute top-0 left-0 h-full bg-terminal-green shadow-[0_0_8px_rgba(34,197,94,0.8)]"
                    initial={{ width: 0 }}
                    animate={{
                        width: isIndeterminate ? "30%" : `${Math.max(2, percent)}%`,
                        x: isIndeterminate ? ["-100%", "400%"] : 0
                    }}
                    transition={isIndeterminate ? {
                        repeat: Infinity,
                        duration: 1.2,
                        ease: "easeInOut"
                    } : {
                        type: "tween",
                        ease: "circOut",
                        duration: 0.3
                    }}
                />
            </div>
        </div>
    );
}
