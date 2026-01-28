import { useRef, useEffect, useState } from 'react';
import { RefreshCw, Smartphone, ShieldAlert, Wifi, List, Activity, Zap, Cpu, Battery, Terminal, ChevronUp, Plus, X, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TerminalLog, ToolsStatus } from '../../hooks/useTerminal';

const MACROS = [
    // System Actions
    { id: 'reboot', label: 'REBOOT SYSTEM', command: 'reboot', icon: RefreshCw, group: 'SYSTEM', variant: 'cyan' },
    { id: 'recovery', label: 'REBOOT RECOVERY', command: 'reboot recovery', icon: ShieldAlert, group: 'SYSTEM', variant: 'cyan' },
    { id: 'bootloader', label: 'REBOOT BOOTLOADER', command: 'reboot bootloader', icon: Smartphone, group: 'SYSTEM', variant: 'cyan' },

    // Fastboot Actions
    { id: 'fb_devices', label: 'FASTBOOT DEVICES', command: 'fastboot devices', icon: Zap, danger: false, group: 'FASTBOOT' },
    { id: 'fb_reboot', label: 'FASTBOOT REBOOT', command: 'fastboot reboot', icon: RefreshCw, group: 'FASTBOOT', variant: 'cyan' },

    // Info & Diagnostics
    { id: 'ip', label: 'SHOW IP ADDRESS', command: 'shell ip -f inet addr show wlan0', icon: Wifi, danger: false, group: 'DIAGNOSTICS' },
    { id: 'battery', label: 'BATTERY STATUS', command: 'shell dumpsys battery', icon: Battery, danger: false, group: 'DIAGNOSTICS' },
    { id: 'uptime', label: 'SYSTEM UPTIME', command: 'shell uptime', icon: Activity, danger: false, group: 'DIAGNOSTICS' },
    { id: 'cpu', label: 'CPU HARDWARE', command: 'shell cat /proc/cpuinfo | grep Hardware', icon: Cpu, danger: false, group: 'DIAGNOSTICS' },

    // Package Management
    { id: 'packages', label: 'ALL PACKAGES', command: 'shell pm list packages', icon: List, danger: false, group: 'PACKAGES' },
    { id: 'packages_3rd', label: 'THIRD PARTY APPS', command: 'shell pm list packages -3', icon: List, danger: false, group: 'PACKAGES' },
];

const COMMAND_SUGGESTIONS = [
    // ADB Core Commands
    'adb devices', 'adb devices -l', 'adb shell', 'adb install', 'adb install -r', 'adb uninstall',
    'adb push', 'adb pull', 'adb logcat', 'adb logcat -C', 'adb logcat *:V', 'adb logcat *:D',
    'adb logcat *:I', 'adb logcat *:W', 'adb logcat *:E', 'adb reboot', 'adb reboot recovery',
    'adb reboot bootloader', 'adb reboot fastboot', 'adb sideload', 'adb connect', 'adb disconnect',
    'adb kill-server', 'adb start-server', 'adb tcpip 5555', 'adb reverse', 'adb forward',
    'adb wait-for-device', 'adb get-state', 'adb get-serialno',

    // ADB Shell System Commands
    'adb shell dumpsys', 'adb shell dumpsys battery', 'adb shell dumpsys wifi', 'adb shell dumpsys activity',
    'adb shell pm list packages', 'adb shell pm list packages -3', 'adb shell pm list packages -s',
    'adb shell pm clear', 'adb shell pm path', 'adb shell pm install',
    'adb shell am start', 'adb shell am force-stop', 'adb shell am kill-all',
    'adb shell uptime', 'adb shell ip addr', 'adb shell ip addr show wlan0', 'adb shell getprop',
    'adb shell setprop', 'adb shell wm size', 'adb shell wm density', 'adb shell screencap -p',
    'adb shell screenrecord', 'adb shell input tap', 'adb shell input swipe', 'adb shell input text',
    'adb shell cat /proc/cpuinfo', 'adb shell cat /proc/meminfo', 'adb shell df -h',
    'adb shell top', 'adb shell ps', 'adb shell ls -la /sdcard/',

    // Fastboot Commands
    'fastboot devices', 'fastboot reboot', 'fastboot reboot-bootloader', 'fastboot flash',
    'fastboot flash boot', 'fastboot flash recovery', 'fastboot flash system', 'fastboot flash vendor',
    'fastboot erase', 'fastboot erase cache', 'fastboot erase userdata', 'fastboot format',
    'fastboot getvar all', 'fastboot oem unlock', 'fastboot oem lock', 'fastboot flashing unlock',
    'fastboot flashing lock', 'fastboot oem device-info', 'fastboot boot', 'fastboot continue',

    // Common Shell/Local Aliases
    'reboot', 'reboot recovery', 'reboot bootloader', 'shell', 'clear', 'exit', 'ls', 'cd', 'cat', 'pwd'
];

// New Interface for Terminal Tab
interface TerminalTab {
    id: string;
    name: string;
    history: TerminalLog[];
    input: string;
}

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
                "w-full flex items-center px-3 py-2.5 text-left border border-transparent transition-all group relative overflow-hidden rounded-lg mb-1",
                disabled ? "opacity-25 cursor-not-allowed" : "hover:bg-white/5 hover:border-white/5",
                macro.variant === 'cyan' && !disabled ? "hover:bg-terminal-cyan/10 hover:border-terminal-cyan/20" :
                    macro.danger && !disabled ? "hover:bg-red-500/10 hover:border-red-500/20" :
                        "active:bg-white/10"
            )}
        >
            <macro.icon className={cn(
                "w-4 h-4 mr-3 shrink-0 transition-all duration-300",
                macro.variant === 'cyan' ? "text-zinc-500 group-hover:text-terminal-cyan" :
                    macro.danger ? "text-zinc-500 group-hover:text-red-400" :
                        "text-zinc-500 group-hover:text-terminal-green"
            )} />
            <div className="flex flex-col overflow-hidden leading-tight z-10 w-full">
                <span className={cn(
                    "font-sans font-medium text-[11px] truncate tracking-wide transition-colors",
                    "text-zinc-300 group-hover:text-white"
                )}>{macro.label}</span>
                <span className="text-[9px] text-zinc-600 truncate font-mono tracking-tight group-hover:text-zinc-500 mt-0.5 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0">{macro.command}</span>
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

export function TerminalView({ history: initialHistory, onExecute, isExecuting, disabled, onClear, sideloadProgress, toolsStatus: _toolsStatus }: TerminalViewProps) {
    // Tab State Management
    const [tabs, setTabs] = useState<TerminalTab[]>([
        { id: 'main', name: 'MAIN TERMINAL', history: initialHistory, input: '' }
    ]);
    const [activeTabId, setActiveTabId] = useState('main');

    // Sync external history to the main tab
    useEffect(() => {
        setTabs(prev => prev.map(t => t.id === 'main' ? { ...t, history: initialHistory } : t));
    }, [initialHistory]);

    // Active Tab Helper
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
    const updateActiveTab = (updates: Partial<TerminalTab>) => {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
    };

    const handleAddTab = () => {
        const newId = `term-${Date.now()}`;
        setTabs([...tabs, { id: newId, name: `TERMINAL ${tabs.length + 1}`, history: [], input: '' }]);
        setActiveTabId(newId);
    };

    const handleCloseTab = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (tabs.length === 1) return;

        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);
        if (activeTabId === id) {
            setActiveTabId(newTabs[newTabs.length - 1].id);
        }
    };

    const [showMacros, setShowMacros] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);

    const handleClearTerminal = () => {
        if (activeTabId === 'main') {
            onClear?.();
        } else {
            updateActiveTab({ history: [] });
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showMacros && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
                setShowMacros(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMacros]);

    // Scroll to bottom on activity
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [activeTab.history]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown' && fullSuggestion) {
            e.preventDefault();

            // Word-by-word completion logic using fullSuggestion
            const currentInput = activeTab.input;

            // If the very next character is a space, we want to complete that space AND the next word
            let nextSpaceIndex;
            if (fullSuggestion[currentInput.length] === ' ') {
                nextSpaceIndex = fullSuggestion.indexOf(' ', currentInput.length + 1);
            } else {
                nextSpaceIndex = fullSuggestion.indexOf(' ', currentInput.length);
            }

            let nextInput;
            if (nextSpaceIndex === -1) {
                // No more spaces, complete the whole suggestion
                nextInput = fullSuggestion;
            } else {
                // Complete up to the next space (including the space)
                nextInput = fullSuggestion.substring(0, nextSpaceIndex + 1);
            }

            updateActiveTab({ input: nextInput });
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (activeTab.input.trim()) {
                if (activeTabId === 'main') {
                    onExecute(activeTab.input, false);
                } else {
                    const cmd = activeTab.input;
                    const newLog: TerminalLog = { id: Date.now(), type: 'command', content: cmd };
                    setTimeout(() => {
                        updateActiveTab({
                            history: [
                                ...activeTab.history,
                                newLog,
                                { id: Date.now() + 1, type: 'info', content: `[Local Terminal] Command '${cmd}' executed locally.` }
                            ]
                        });
                    }, 100);
                }
                updateActiveTab({ input: '' });
            }
        }
    };

    // Calculate suggestion
    const fullSuggestion = activeTab.input.trim()
        ? COMMAND_SUGGESTIONS.find(s => s.startsWith(activeTab.input.toLowerCase()))
        : '';

    // Ghost text should only show the current/next word
    let suggestion = '';
    if (fullSuggestion) {
        // Find the index of the space that marks the end of the word we are CURRENTLY completing
        // We use .trimEnd() to ignore trailing spaces when finding the boundary
        const nextSpaceIndex = fullSuggestion.indexOf(' ', activeTab.input.length);

        if (nextSpaceIndex === -1) {
            suggestion = fullSuggestion;
        } else {
            // If the input already reaches a space, we should show the NEXT word too
            if (nextSpaceIndex === activeTab.input.length || fullSuggestion[activeTab.input.length - 1] === ' ') {
                const followingSpaceIndex = fullSuggestion.indexOf(' ', activeTab.input.length + 1);
                suggestion = followingSpaceIndex === -1 ? fullSuggestion : fullSuggestion.substring(0, followingSpaceIndex);
            } else {
                suggestion = fullSuggestion.substring(0, nextSpaceIndex);
            }
        }
    }

    return (
        <div className="flex h-full bg-black font-mono text-sm relative w-full overflow-hidden">
            {/* Main Page Pane (Header + Terminal) */}
            <div className="flex-1 flex flex-col min-w-0 h-full transition-all duration-300 relative overflow-hidden">
                {/* Main Content Area: Terminal with Floating HUD */}
                <div className="flex-1 flex overflow-hidden relative z-10 w-full group/terminal">
                    {/* Floating HUD Controls (Top Right) */}
                    <div className="absolute top-4 right-6 z-50 flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-500">
                        <button
                            onClick={handleClearTerminal}
                            className="p-2.5 bg-black/60 backdrop-blur-xl border border-white/10 hover:border-terminal-green/40 text-zinc-500 hover:text-terminal-green transition-all shadow-2xl rounded-lg group/hud-btn"
                            title="CLEAR TERMINAL"
                        >
                            <Trash2 className="w-4 h-4 group-hover/hud-btn:scale-110 transition-transform" strokeWidth={2.5} />
                        </button>
                        <button
                            onClick={() => setShowMacros(!showMacros)}
                            className={cn(
                                "p-2.5 backdrop-blur-xl border transition-all shadow-2xl rounded-lg group/hud-btn",
                                showMacros
                                    ? "bg-terminal-green/10 border-terminal-green/50 text-terminal-green"
                                    : "bg-black/60 border-white/10 text-zinc-500 hover:text-white"
                            )}
                            title="MACRO COMMANDS"
                        >
                            <Zap className="w-4 h-4 group-hover/hud-btn:scale-110 transition-transform" strokeWidth={2.5} />
                        </button>
                    </div>



                    {/* CRUNCHY GRID BACKGROUND */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0">
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,65,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,65,0.1)_1px,transparent_1px)] bg-[size:30px_30px]" />
                    </div>

                    <div
                        ref={scrollRef}
                        className="flex-1 pt-12 pl-12 pr-[18px] pb-10 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-terminal-green/10 relative z-10 w-full"
                        onClick={() => {
                            // Focus input when clicking anywhere in terminal
                            const inputElement = document.querySelector('input[type="text"]') as HTMLInputElement;
                            if (inputElement) inputElement.focus();
                        }}
                    >
                        {activeTab.history.map((log) => (
                            <TerminalLogEntry key={log.id} log={log} />
                        ))}

                        {isExecuting && sideloadProgress === null && (
                            <div className="text-terminal-green/60 animate-pulse mt-4 font-space font-black tracking-[0.3em] text-[11px] flex items-center gap-3 mb-4">
                                <div className="w-1.5 h-1.5 bg-terminal-green rotate-45" />
                                COMMAND EXECUTION IN PROGRESS...
                            </div>
                        )}

                        {/* Active Input Line - Native Terminal Style at BOTTOM */}
                        {!disabled && !isExecuting && (
                            <div className="flex items-center w-full mt-2 group relative">
                                <span className="text-terminal-green mr-3 font-black text-[14px] select-none shrink-0 group-focus-within:drop-shadow-[0_0_8px_rgba(0,255,65,0.6)] transition-all">{">"}</span>
                                <div className="flex-1 relative isolate">
                                    {/* Suggestion Overlay */}
                                    {suggestion && (
                                        <div className="absolute inset-0 flex items-center pointer-events-none text-[14px] font-mono tracking-wide">
                                            <span className="opacity-0 whitespace-pre">{activeTab.input}</span>
                                            <span className="text-white/20 whitespace-pre">
                                                {suggestion.substring(activeTab.input.length).replace(/ /g, '\u00a0')}
                                            </span>
                                        </div>
                                    )}
                                    <input
                                        type="text"
                                        value={activeTab.input}
                                        onChange={(e) => updateActiveTab({ input: e.target.value })}
                                        onKeyDown={handleKeyDown}
                                        disabled={activeTabId === 'main' && (isExecuting || disabled)}
                                        className="w-full bg-transparent text-white font-mono text-[14px] focus:outline-none transition-colors tracking-wide caret-terminal-green selection:bg-terminal-green/30 relative z-10"
                                        autoFocus
                                        spellCheck={false}
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                        )}


                    </div>
                </div>

                {/* Tab Bar Container (Bottom) - Only show if sidebar is not pinned (pinned sidebar takes full height) */}
                {/* Tab Bar Container (Bottom) */}
                <div className="absolute bottom-0 left-0 right-0 h-10 w-full z-40 flex justify-center group/tabbar">
                    {/* Interactive Zone - Stops pointer events from passing through when expanded */}
                    <div className="w-full h-full relative flex flex-col items-center justify-end pointer-events-auto">

                        {/* Handle Tab - Always Visible */}
                        <div className="w-12 h-6 bg-transparent flex items-center justify-center cursor-pointer transition-all duration-300 translate-y-1 group-hover/tabbar:translate-y-0 group-hover/tabbar:opacity-0 animate-bounce">
                            <ChevronUp className="w-5 h-5 text-terminal-green/40 group-hover/tabbar:text-terminal-green/80 transition-colors" />
                        </div>

                        {/* Expanded Tab Bar - Slides Up */}
                        {/* Expanded Tab Bar - Slides Up */}
                        <div className="absolute bottom-0 translate-y-full group-hover/tabbar:translate-y-0 transition-transform duration-300 w-auto min-w-[100px] max-w-5xl h-14 bg-black border-t border-x border-white/10 rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,1)] flex items-center px-2 gap-1 pb-2 pt-2 z-50 mx-auto">
                            {tabs.map(tab => (
                                <div
                                    key={tab.id}
                                    onClick={() => setActiveTabId(tab.id)}
                                    className={cn(
                                        "h-9 rounded-lg flex items-center justify-between px-3 cursor-pointer transition-all select-none group/tab min-w-[140px] max-w-[200px] relative overflow-hidden",
                                        activeTabId === tab.id
                                            ? "bg-black text-white"
                                            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                                    )}
                                >
                                    {/* Active Tab Indicator Line */}
                                    {activeTabId === tab.id && (
                                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-terminal-green shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
                                    )}

                                    <div className="flex items-center gap-2 overflow-hidden z-10">
                                        <Terminal className={cn("w-3.5 h-3.5 shrink-0 transition-colors", activeTabId === tab.id ? "text-terminal-green" : "text-zinc-600 group-hover/tab:text-zinc-400")} />
                                        <span className="font-sans font-medium text-[11px] truncate tracking-wide">{tab.name}</span>
                                    </div>
                                    <button
                                        onClick={(e) => handleCloseTab(tab.id, e)}
                                        className={cn(
                                            "p-0.5 rounded-full hover:bg-white/10 hover:text-white ml-2 transition-all opacity-0 group-hover/tab:opacity-100",
                                            tabs.length === 1 && "hidden"
                                        )}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}

                            <div className="w-[1px] h-6 bg-white/10 mx-1" />

                            <button
                                onClick={handleAddTab}
                                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-zinc-500 hover:text-white transition-all shrink-0"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Macro Sidebar (Clean Panel Mode) */}
            <div
                ref={sidebarRef}
                className={cn(
                    "fixed top-0 right-0 bottom-0 w-80 z-[60] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
                    showMacros ? "translate-x-0" : "translate-x-full"
                )}
            >


                {/* Sidebar Content (Overlay) */}
                <div className={cn(
                    "w-80 bg-black/90 border-l border-white/10 backdrop-blur-2xl flex flex-col h-full shadow-[-20px_0_50px_rgba(0,0,0,0.9)] relative"
                )}>
                    {/* Close Button */}
                    <button
                        onClick={() => setShowMacros(false)}
                        className="absolute top-3 right-3 p-2 hover:bg-white/5 text-zinc-500 hover:text-white rounded-lg transition-all z-20 outline-none group/close"
                        title="CLOSE SIDEBAR"
                    >
                        <X className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" strokeWidth={2.5} />
                    </button>

                    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent p-3 pt-6">
                        {MACROS.map((macro, index) => {
                            const prevGroup = index > 0 ? MACROS[index - 1].group : null;
                            const showHeader = macro.group !== prevGroup;

                            return (
                                <div key={macro.id}>
                                    {showHeader && (
                                        <div className="px-2 py-2 mt-2 mb-1 text-[10px] font-sans font-medium text-zinc-500 flex items-center gap-3">
                                            {macro.group}
                                            <div className="h-[1px] flex-1 bg-white/5" />
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
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-zinc-950/95 border-t border-terminal-green/40 backdrop-blur-2xl shadow-2xl z-50">
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
