import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "../lib/utils";
import { Minus, Square, X, Copy } from "lucide-react";

interface TitleBarProps {
    className?: string;
    deviceConnected?: boolean;
    isRooted?: boolean;
}

export function TitleBar({ className, deviceConnected = false, isRooted = false }: TitleBarProps) {
    const [isMaximized, setIsMaximized] = useState(false);

    // Tauri v2 window instance
    // Note: ensure this runs only in client side, preventing SSR issues if any (though this is SPA)

    useEffect(() => {
        const updateState = async () => {
            try {
                const win = getCurrentWindow();
                setIsMaximized(await win.isMaximized());
            } catch (e) {
                console.error(e);
            }
        };
        updateState();
    }, []);

    const minimize = async () => {
        try { await getCurrentWindow().minimize(); } catch (e) { }
    };

    const toggleMaximize = async () => {
        try {
            const win = getCurrentWindow();
            await win.toggleMaximize();
            setIsMaximized(await win.isMaximized());
        } catch (e) { }
    };

    const close = async () => {
        try { await getCurrentWindow().close(); } catch (e) { }
    };

    return (
        <div
            className={cn(
                "h-8 flex items-center justify-between bg-black border-b border-terminal-green/20 select-none relative",
                className
            )}
        >
            {/* Native Drag Handle Layer (Absolute Background) */}
            <div
                data-tauri-drag-region
                className="absolute inset-0 z-0 cursor-default"
            />

            {/* Title & Info Section (Non-interactive area) */}
            <div className="flex items-center space-x-4 px-3 z-10 pointer-events-none">
                <div className="flex items-center space-x-1.5">
                    <span className="text-sm font-mono font-bold text-terminal-green">&gt;</span>
                    <span className="text-sm font-space font-black text-terminal-green tracking-[0.1em] drop-shadow-[0_0_10px_rgba(0,255,65,0.6)]">
                        EASY_ADB
                    </span>
                    <div className="w-2.5 h-4 bg-terminal-green animate-cursor-blink shadow-[0_0_8px_rgba(0,255,65,0.8)]"></div>
                </div>
            </div>

            {/* Controls & Status Section (Interactive area) */}
            <div className="flex items-center h-full z-20">
                {/* Status Indicators */}
                <div className="flex items-center space-x-4 text-[10px] mr-4 pointer-events-none select-none">
                    {/* ROOT Status */}
                    <div className="flex items-center space-x-1.5 transition-opacity duration-500">
                        <div className={cn("w-1 h-1 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)]", isRooted ? "bg-terminal-green shadow-[0_0_8px_rgba(0,255,65,0.4)] animate-pulse" : "bg-terminal-red")} />
                        <div className={cn("flex items-baseline space-x-1", isRooted ? "text-terminal-green" : "text-terminal-red")}>
                            <span className="font-space font-black tracking-widest">ROOT:</span>
                            <span className={cn("font-mono font-bold", isRooted && "drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]")}>
                                {isRooted ? "YES" : "NO"}
                            </span>
                        </div>
                    </div>

                    {/* ADB Status */}
                    <div className="flex items-center space-x-1.5 transition-opacity duration-500">
                        <div className={cn("w-1 h-1 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)]", deviceConnected ? "bg-terminal-green shadow-[0_0_8px_rgba(0,255,65,0.4)] animate-pulse" : "bg-terminal-red")} />
                        <div className={cn("flex items-baseline space-x-1", deviceConnected ? "text-terminal-green" : "text-terminal-red")}>
                            <span className="font-space font-black tracking-widest">ADB:</span>
                            <span className={cn("font-mono font-bold", deviceConnected && "drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]")}>
                                {deviceConnected ? "ON" : "OFF"}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="h-4 w-[1px] bg-terminal-green/20 mr-1"></div>

                {/* Window Buttons */}
                <div className="flex items-center h-full">
                    <button
                        onClick={minimize}
                        className="h-full px-4 hover:bg-terminal-green/10 text-terminal-green/50 hover:text-terminal-green transition-colors flex items-center justify-center focus:outline-none"
                        tabIndex={-1}
                    >
                        <Minus className="w-3 h-3" />
                    </button>
                    <button
                        onClick={toggleMaximize}
                        className="h-full px-4 hover:bg-terminal-green/10 text-terminal-green/50 hover:text-terminal-green transition-colors flex items-center justify-center focus:outline-none"
                        tabIndex={-1}
                    >
                        {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
                    </button>
                    <button
                        onClick={close}
                        className="h-full px-4 hover:bg-red-500/20 text-terminal-green/50 hover:text-red-500 transition-colors flex items-center justify-center focus:outline-none"
                        tabIndex={-1}
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}
