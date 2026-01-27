import { useRef, useEffect, useState } from 'react';
import { RefreshCw, Smartphone, ShieldAlert, Wifi, List, Activity, Zap, Cpu, Battery, Trash2, Terminal } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TerminalLog, ToolsStatus } from '../../hooks/useTerminal';

const MACROS = [
    // System Actions
    { id: 'reboot', label: 'REBOOT SYSTEM', command: 'reboot', icon: RefreshCw, group: 'SYSTEM', variant: 'amber' },
    { id: 'recovery', label: 'REBOOT RECOVERY', command: 'reboot recovery', icon: ShieldAlert, group: 'SYSTEM', variant: 'amber' },
    { id: 'bootloader', label: 'REBOOT BOOTLOADER', command: 'reboot bootloader', icon: Smartphone, group: 'SYSTEM', variant: 'amber' },

    // Fastboot Actions
    { id: 'fb_devices', label: 'FASTBOOT DEVICES', command: 'fastboot devices', icon: Zap, danger: false, group: 'FASTBOOT' },
    { id: 'fb_reboot', label: 'FASTBOOT REBOOT', command: 'fastboot reboot', icon: RefreshCw, group: 'FASTBOOT', variant: 'amber' },

    // Info & Diagnostics
    { id: 'ip', label: 'SHOW IP ADDRESS', command: 'shell ip -f inet addr show wlan0', icon: Wifi, danger: false, group: 'DIAGNOSTICS' },
    { id: 'battery', label: 'BATTERY STATUS', command: 'shell dumpsys battery', icon: Battery, danger: false, group: 'DIAGNOSTICS' },
    { id: 'uptime', label: 'SYSTEM UPTIME', command: 'shell uptime', icon: Activity, danger: false, group: 'DIAGNOSTICS' },
    { id: 'cpu', label: 'CPU HARDWARE', command: 'shell cat /proc/cpuinfo | grep Hardware', icon: Cpu, danger: false, group: 'DIAGNOSTICS' },

    // Package Management
    { id: 'packages', label: 'ALL PACKAGES', command: 'shell pm list packages', icon: List, danger: false, group: 'PACKAGES' },
    { id: 'packages_3rd', label: 'THIRD PARTY APPS', command: 'shell pm list packages -3', icon: List, danger: false, group: 'PACKAGES' },
];

interface MacroButtonProps {
    macro: typeof MACROS[0];
    disabled: boolean;
    onClick: (cmd: string) => void;
}

function MacroButton({ macro, disabled, onClick }: MacroButtonProps) {
    return (
        <button
            onClick={() => onClick(macro.command)}
            disabled={disabled}
            className={cn(
                "w-full flex items-center px-4 py-3 text-left border-l-[3px] border-transparent transition-all group relative overflow-hidden",
                disabled ? "opacity-25 cursor-not-allowed" : "hover:bg-zinc-900/60 hover:border-terminal-green/50",
                macro.variant === 'amber' && !disabled ? "hover:text-terminal-amber hover:border-terminal-amber/50" :
                    macro.danger && !disabled ? "hover:text-red-500 hover:border-red-500/50" :
                        "text-terminal-green/90 hover:text-white"
            )}
        >
            <div className="absolute inset-0 w-full h-[1px] bg-terminal-green/20 -translate-y-full group-hover:animate-scanline pointer-events-none opacity-40" />
            <macro.icon className={cn(
                "w-4 h-4 mr-4 shrink-0 transition-transform duration-500 group-hover:scale-110",
                macro.variant === 'amber' ? "text-terminal-amber/70 group-hover:text-terminal-amber" :
                    macro.danger ? "text-terminal-red/70 group-hover:text-terminal-red" :
                        "text-terminal-green/50 group-hover:text-terminal-green"
            )} />
            <div className="flex flex-col overflow-hidden leading-tight z-10 w-full">
                <span className="font-space font-black text-[10px] truncate uppercase tracking-[0.15em] drop-shadow-[0_0_5px_rgba(34,197,94,0.2)]">{macro.label}</span>
                <span className="text-[8px] text-zinc-500 truncate font-mono tracking-tighter group-hover:text-zinc-400 mt-0.5 opacity-60">{macro.command}</span>
            </div>
        </button>
    );
}

// Deprecated Sidebar - kept for type safety if needed but logic moved to Main View
export function TerminalSidebar(_props: any) {
    return null;
}

function TerminalLogEntry({ log }: { log: TerminalLog }) {
    if (log.type === 'command') {
        return (
            <div className="flex items-start gap-3 w-full font-mono text-[13px] leading-relaxed group hover:bg-white/5 px-2 py-0.5 -mx-2 rounded transition-colors">
                <span className="text-terminal-green/80 font-bold select-none shrink-0">{">"}</span>
                <span className="text-yellow-400 font-medium tracking-wide break-all">{log.content}</span>
            </div>
        );
    }

    const outputColor =
        log.type === 'error' ? 'text-red-400' :
            log.type === 'success' ? 'text-terminal-green' :
                log.type === 'warning' ? 'text-terminal-amber' :
                    'text-zinc-300';

    return (
        <div className={cn(
            "whitespace-pre-wrap break-words w-full font-mono text-[12px] leading-normal pl-[20px] py-0.5 opacity-90",
            outputColor
        )}>
            {log.content}
        </div>
    );
}

interface TerminalViewProps {
    history: TerminalLog[];
    onExecute: (cmd: string, isMacro: boolean) => void;
    isExecuting: boolean;
    disabled: boolean;
    onClear?: () => void;
    sideloadProgress?: number | null;
    toolsStatus?: ToolsStatus;
}

export function TerminalView({ history, onExecute, isExecuting, disabled, onClear, sideloadProgress, toolsStatus: _toolsStatus }: TerminalViewProps) {
    const [input, setInput] = useState('');
    const [showMacros, setShowMacros] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.trim()) {
                onExecute(input, false);
                setInput('');
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-black font-mono text-sm relative w-full overflow-hidden">
            {/* Unified Command Center HUD Header */}
            <div className="p-4 border-b border-terminal-green/20 bg-zinc-950/20 space-y-4 shrink-0 relative z-30">
                <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                        <h2 className="text-xs font-space font-black text-terminal-green tracking-[0.2em] flex items-center gap-2 uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                            <Terminal className="w-3.5 h-3.5 text-terminal-green" />
                            TERMINAL
                        </h2>
                        <div className="flex items-center gap-2 mt-1.5 font-mono text-[9px] tracking-widest uppercase">
                            <div className="flex items-center gap-2">
                                <Activity className="w-3 h-3 text-terminal-green/60" />
                                <span className="text-zinc-500 font-bold">LIVE SHELL SESSION</span>
                            </div>
                            <div className="w-1 h-1 bg-terminal-green/30 rounded-full" />
                            <span className="text-terminal-green/60">READY</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClear}
                            disabled={disabled || isExecuting}
                            className="group relative p-2 border border-terminal-green/20 hover:border-terminal-green/60 hover:bg-terminal-green/5 transition-all outline-none"
                        >
                            <Trash2 className="w-3.5 h-3.5 text-terminal-green/40 group-hover:text-red-500 transition-all" />
                        </button>

                        <div className="w-px h-6 bg-terminal-green/20 mx-1" />

                        {/* Quick Action Trigger */}
                        <button
                            onClick={() => setShowMacros(!showMacros)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 border transition-all text-[9px] font-space font-black tracking-widest uppercase",
                                showMacros
                                    ? "opacity-0 w-0 px-0 overflow-hidden border-0"
                                    : "bg-transparent text-terminal-green border-terminal-green/40 hover:bg-terminal-green/10"
                            )}
                        >
                            <List className="w-3 h-3" />
                            <span className={cn("whitespace-nowrap transition-all", showMacros && "opacity-0 w-0")}>QUICK MACROS</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area: Terminal + Sidebar */}
            <div className="flex-1 flex overflow-hidden relative z-10">
                {/* CRUNCHY GRID BACKGROUND */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,65,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,65,0.1)_1px,transparent_1px)] bg-[size:30px_30px]" />
                </div>

                {/* Terminal Output */}
                <div
                    ref={scrollRef}
                    className="flex-1 pt-[26px] px-[18px] pb-10 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-terminal-green/10 w-full relative z-10 transition-all duration-300"
                    onClick={() => {
                        // Focus input when clicking anywhere in terminal
                        const inputElement = document.querySelector('input[type="text"]') as HTMLInputElement;
                        if (inputElement) inputElement.focus();
                    }}
                >
                    {history.map((log) => (
                        <TerminalLogEntry key={log.id} log={log} />
                    ))}

                    {isExecuting && sideloadProgress === null && (
                        <div className="text-terminal-green/60 animate-pulse mt-4 font-space font-black tracking-[0.3em] text-[11px] flex items-center gap-3 mb-4">
                            <div className="w-1.5 h-1.5 bg-terminal-green rotate-45" />
                            COMMAND EXECUTION IN PROGRESS...
                        </div>
                    )}

                    {/* Active Input Line - Integrated into flow */}
                    {!disabled && !isExecuting && (
                        <div className="flex items-center w-full mt-2 group">
                            <span className="text-terminal-green mr-3 font-black text-[13px] select-none shrink-0 group-focus-within:drop-shadow-[0_0_8px_rgba(0,255,65,0.6)] transition-all">{">"}</span>
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={isExecuting || disabled}
                                className="flex-1 bg-transparent text-white font-mono text-[13px] focus:outline-none placeholder:text-zinc-800 transition-colors tracking-wide caret-terminal-green selection:bg-terminal-green/30"
                                autoFocus
                                spellCheck={false}
                                autoComplete="off"
                            />
                        </div>
                    )}
                </div>

                {/* Quick Macro Sidebar (Dynamic Resize) */}
                <div className={cn(
                    "bg-zinc-950/40 border-l border-terminal-green/20 overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
                    showMacros ? "w-64 opacity-100" : "w-0 opacity-0 border-l-0"
                )}>
                    {/* Header that matches the trigger button style */}
                    <div className="p-4 py-3 border-b border-terminal-green/10 flex items-center justify-between shrink-0 bg-black/40">
                        <button
                            onClick={() => setShowMacros(false)}
                            className="bg-terminal-green text-black border border-terminal-green flex items-center gap-2 px-3 py-1.5 transition-all text-[9px] font-space font-black tracking-widest uppercase w-full justify-center"
                        >
                            <List className="w-3 h-3" />
                            QUICK MACROS
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-terminal-green/10 p-2">
                        {MACROS.map((macro, index) => {
                            const prevGroup = index > 0 ? MACROS[index - 1].group : null;
                            const showHeader = macro.group !== prevGroup;

                            return (
                                <div key={macro.id}>
                                    {showHeader && (
                                        <div className="px-4 py-2 mt-2 text-[8px] font-space font-black text-terminal-green/30 uppercase tracking-[0.3em] border-b border-terminal-green/5 mb-1">
                                            {macro.group}
                                        </div>
                                    )}
                                    <MacroButton
                                        macro={macro}
                                        disabled={disabled || isExecuting}
                                        onClick={(cmd) => {
                                            onExecute(cmd, true);
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {sideloadProgress !== null && (
                <div className="flex-none p-6 bg-zinc-950/95 border-t border-terminal-green/40 backdrop-blur-2xl shadow-2xl relative z-20">
                    <div className="justify-between items-center mb-3 text-[11px] font-space font-black text-terminal-green tracking-widest flex">
                        <span className="flex items-center gap-3">
                            <Zap className="w-4 h-4 animate-ping" />
                            SIDELOAD PROGRESS
                        </span>
                        <span className="tabular-nums bg-terminal-green/20 px-2 py-0.5 border border-terminal-green/30">{sideloadProgress}%</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-none overflow-hidden border border-terminal-green/20">
                        <div
                            className="h-full bg-terminal-green shadow-[0_0_20px_rgba(0,255,65,0.8)] transition-all duration-300 ease-out"
                            style={{ width: `${sideloadProgress}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
