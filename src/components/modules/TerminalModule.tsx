import { useRef, useEffect, useState } from 'react';
import { Play, RefreshCw, Smartphone, ShieldAlert, Wifi, List, Activity, Zap, Cpu, Download, Battery, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TerminalLog, ToolsStatus } from '../../hooks/useTerminal';

const MACROS = [
    // System Actions
    { id: 'reboot', label: 'REBOOT_SYSTEM', command: 'reboot', icon: RefreshCw, group: 'SYSTEM', variant: 'amber' },
    { id: 'recovery', label: 'REBOOT_RECOVERY', command: 'reboot recovery', icon: ShieldAlert, group: 'SYSTEM', variant: 'amber' },
    { id: 'bootloader', label: 'REBOOT_BOOTLOADER', command: 'reboot bootloader', icon: Smartphone, group: 'SYSTEM', variant: 'amber' },

    // Fastboot Actions
    { id: 'fb_devices', label: 'FASTBOOT_DEVICES', command: 'fastboot devices', icon: Zap, danger: false, group: 'FASTBOOT' },
    { id: 'fb_reboot', label: 'FASTBOOT_REBOOT', command: 'fastboot reboot', icon: RefreshCw, group: 'FASTBOOT', variant: 'amber' },

    // Info & Diagnostics
    { id: 'ip', label: 'SHOW_IP_ADDR', command: 'shell ip -f inet addr show wlan0', icon: Wifi, danger: false, group: 'DIAGNOSTICS' },
    { id: 'battery', label: 'BATT_TELEMETRY', command: 'shell dumpsys battery', icon: Battery, danger: false, group: 'DIAGNOSTICS' },
    { id: 'uptime', label: 'CLOCK_UPTIME', command: 'shell uptime', icon: Activity, danger: false, group: 'DIAGNOSTICS' },
    { id: 'cpu', label: 'CPU_CORE_INFO', command: 'shell cat /proc/cpuinfo | grep Hardware', icon: Cpu, danger: false, group: 'DIAGNOSTICS' },

    // Package Management
    { id: 'packages', label: 'ALL_PKGS', command: 'shell pm list packages', icon: List, danger: false, group: 'PACKAGE_MGMT' },
    { id: 'packages_3rd', label: 'USER_PKGS', command: 'shell pm list packages -3', icon: List, danger: false, group: 'PACKAGE_MGMT' },
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
            <div className="flex flex-col overflow-hidden leading-tight z-10">
                <span className="font-space font-black text-[10px] truncate uppercase tracking-[0.15em] drop-shadow-[0_0_5px_rgba(34,197,94,0.2)]">{macro.label}</span>
                <span className="text-[8px] text-zinc-500 truncate font-mono tracking-tighter group-hover:text-zinc-400 mt-0.5">{macro.command}</span>
            </div>
        </button>
    );
}

interface TerminalSidebarProps {
    onExecute: (cmd: string, isMacro: boolean) => void;
    isExecuting: boolean;
    disabled: boolean;
    toolsStatus: ToolsStatus;
    onInstallTools: () => void;
}

export function TerminalSidebar({ onExecute, isExecuting, disabled, toolsStatus, onInstallTools }: TerminalSidebarProps) {
    const hasMissingTools = !toolsStatus.adb || !toolsStatus.fastboot;

    return (
        <div className="flex flex-col h-full bg-black">
            <div className="p-4 border-b border-terminal-green/20 bg-zinc-950/20">
                <h2 className="text-xs font-space font-black text-white tracking-[0.25em] uppercase drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">
                    MACRO_BANK_0.1
                </h2>
            </div>

            {hasMissingTools && (
                <div className="p-3 space-y-2">
                    <button
                        onClick={onInstallTools}
                        disabled={isExecuting}
                        className="w-full flex items-center p-3 text-left bg-red-950/20 border border-red-500/40 hover:bg-red-900/20 transition-all group overflow-hidden relative shadow-lg"
                        style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
                    >
                        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-red-400/60" />
                        <Download className="w-5 h-5 mr-3 text-red-500 shrink-0" />
                        <div className="flex flex-col">
                            <span className="font-space font-black text-[10px] text-red-100 tracking-widest uppercase">INSTALL_TOOLS</span>
                            <span className="text-[8px] text-red-500/60 font-mono uppercase tracking-tighter">BINARIES_NOT_FOUND</span>
                        </div>
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-terminal-green/10">
                {MACROS.map((macro, index) => {
                    const prevGroup = index > 0 ? MACROS[index - 1].group : null;
                    const showHeader = macro.group !== prevGroup;
                    const isFBCmd = macro.group === 'FASTBOOT';
                    const cmdDisabledByTools = isFBCmd && !toolsStatus.fastboot;

                    return (
                        <div key={macro.id}>
                            {showHeader && (
                                <div className="px-4 py-2 mt-5 text-[9px] font-space font-black text-terminal-green/30 uppercase tracking-[0.3em] border-b border-terminal-green/5">
                                    {macro.group}_PROTOCOLS
                                </div>
                            )}
                            <MacroButton
                                macro={macro}
                                disabled={disabled || isExecuting || cmdDisabledByTools}
                                onClick={(cmd) => onExecute(cmd, true)}
                            />
                        </div>
                    );
                })}
            </div>
            <div className="p-4 border-t border-terminal-green/5 text-[8px] text-terminal-green/30 font-mono tracking-widest text-center uppercase">
                CMD_KERNEL_V1.2
            </div>
        </div>
    );
}

function TerminalLogEntry({ log }: { log: TerminalLog }) {
    const styles = {
        command: "text-white mt-10 font-space font-black uppercase tracking-[0.25em] text-[11px] flex items-center gap-4 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]",
        output: "text-terminal-green font-mono leading-relaxed text-[12px] opacity-90",
        error: "text-red-400 font-mono font-bold border-l-2 border-red-500/30 pl-4 py-1 my-2 bg-red-500/5 uppercase text-[11px] tracking-wide",
        info: "text-blue-300 font-black font-space text-[12px] tracking-wider my-2 opacity-80",
        success: "text-terminal-green font-black font-space text-[12px] tracking-widest my-2 drop-shadow-[0_0_5px_rgba(0,255,65,0.3)]",
        warning: "text-terminal-amber font-black font-space text-[12px] tracking-wider my-2"
    };

    return (
        <div className={cn(
            "whitespace-pre-wrap break-words w-full px-2",
            styles[log.type]
        )}>
            {log.type === 'command' && <div className="h-[2px] flex-1 bg-white/10" />}
            {log.type === 'command' && <span className="text-terminal-green/40">{"//"}</span>}
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
}

export function TerminalView({ history, onExecute, isExecuting, disabled, onClear, sideloadProgress }: TerminalViewProps) {
    const [input, setInput] = useState('');
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
            {/* CRUNCHY GRID BACKGROUND */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,65,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,65,0.1)_1px,transparent_1px)] bg-[size:30px_30px]" />
            </div>

            <div className="absolute top-4 right-6 z-20">
                <button
                    onClick={onClear}
                    className="p-2.5 text-terminal-green/40 hover:text-red-500 hover:bg-red-500/10 transition-all border border-terminal-green/20 hover:border-red-500/40 rounded-none shadow-xl bg-black/60 backdrop-blur-md"
                    title="TERMINATE_HISTORY"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 p-10 overflow-y-auto scrollbar-thin scrollbar-thumb-terminal-green/10 w-full bg-zinc-950/20 relative z-10"
            >
                {history.map((log) => (
                    <TerminalLogEntry key={log.id} log={log} />
                ))}
                {isExecuting && sideloadProgress === null && (
                    <div className="text-terminal-green/60 animate-pulse mt-8 font-space font-black tracking-[0.3em] text-[11px] flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-terminal-green rotate-45" />
                        OVERWRITING_SECTORS_IN_PROGRESS...
                    </div>
                )}
            </div>

            {sideloadProgress !== null && (
                <div className="flex-none p-6 bg-zinc-950/95 border-t border-terminal-green/40 backdrop-blur-2xl shadow-2xl relative z-20">
                    <div className="flex justify-between items-center mb-3 text-[11px] font-space font-black text-terminal-green tracking-widest">
                        <span className="flex items-center gap-3">
                            <Zap className="w-4 h-4 animate-ping" />
                            DATA_SIDELOAD_ACTIVE_LINK
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

            <div className="flex-none p-6 border-t border-terminal-green/20 bg-zinc-950/90 backdrop-blur-md flex items-center w-full relative z-20">
                <span className="text-terminal-green mr-5 font-black text-lg animate-pulse drop-shadow-[0_0_8px_#00ff41] select-none">{">"}</span>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isExecuting || disabled}
                    placeholder={disabled ? "ESTABLISH_CONNECTION_TO_ACCESS_TERMINAL..." : "COMMAND_INPUT_01..."}
                    className="flex-1 bg-transparent text-white font-mono text-base focus:outline-none placeholder:text-zinc-600 transition-colors uppercase tracking-wider"
                    autoFocus
                />
                <button
                    onClick={() => {
                        if (input.trim()) {
                            onExecute(input, false);
                            setInput('');
                        }
                    }}
                    disabled={isExecuting || disabled || !input.trim()}
                    className="ml-5 p-3 px-6 bg-terminal-green/10 border border-terminal-green/40 text-terminal-green hover:bg-terminal-green hover:text-black transition-all shadow-[0_0_15px_rgba(0,255,65,0.1)] group"
                >
                    <Play className="w-5 h-5 fill-current transform group-hover:scale-110" />
                </button>
            </div>
        </div>
    );
}
