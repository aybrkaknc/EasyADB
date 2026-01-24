import { cn } from '../../lib/utils';
import { FolderOpen, Monitor, Info } from 'lucide-react';

interface SettingsModuleProps {
    activeTab: 'paths' | 'general' | 'about';
    bgStyle?: string;
    onTabChange: (tab: 'paths' | 'general' | 'about') => void;
}

/**
 * SettingsModule: Ayarlar menüsü yan paneli.
 */
export function SettingsModule({ activeTab, onTabChange }: SettingsModuleProps) {
    return (
        <div className="flex flex-col h-full bg-black">
            {/* Header */}
            <div className="p-4 border-b border-terminal-green/20">
                <h2 className="text-sm font-space font-black text-terminal-green tracking-widest">
                    SYSTEM_CONFIG
                </h2>
                <div className="text-[10px] font-mono text-terminal-green/40 mt-1">
                    VERSION 2.0.1
                </div>
            </div>

            {/* Config List */}
            <div className="flex-1 p-2 space-y-1.5">
                {/* Paths Option */}
                <button
                    onClick={() => onTabChange('paths')}
                    className={cn(
                        "relative w-full flex items-center p-3 text-left transition-all group overflow-hidden border",
                        activeTab === 'paths'
                            ? "bg-terminal-green/10 border-terminal-green/50 text-terminal-green"
                            : "bg-black/40 border-terminal-green/10 text-terminal-green/60 hover:border-terminal-green/30 hover:bg-terminal-green/5"
                    )}
                    style={{
                        clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))'
                    }}
                >
                    {/* Laser Scan (Hover) */}
                    <div className="absolute inset-0 w-full h-[1px] bg-terminal-green/20 -translate-y-full group-hover:animate-scanline pointer-events-none" />

                    <FolderOpen className="w-4 h-4 mr-3 relative z-10" />
                    <div className="relative z-10 flex-1">
                        <div className="text-[11px] font-space font-black tracking-widest uppercase">DIRECTORY_PATHS</div>
                        <div className="text-[9px] font-mono opacity-50">Backup & Restore locations</div>
                    </div>
                    {activeTab === 'paths' && (
                        <div className="ml-2 w-1.5 h-1.5 bg-terminal-green rotate-45 shadow-[0_0_8px_rgba(0,255,65,1)]" />
                    )}
                </button>

                {/* General Option (Disabled) */}
                <button
                    disabled
                    className="relative w-full flex items-center p-3 text-left text-terminal-green/20 cursor-not-allowed border border-terminal-green/5 bg-black/20"
                    style={{
                        clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))'
                    }}
                >
                    <Monitor className="w-4 h-4 mr-3 opacity-30" />
                    <div>
                        <div className="text-[11px] font-space font-black tracking-widest uppercase opacity-40">GENERAL</div>
                        <div className="text-[9px] font-mono opacity-20">Display & Behavior (Soon)</div>
                    </div>
                </button>

                {/* About Option (Disabled) */}
                <button
                    disabled
                    className="relative w-full flex items-center p-3 text-left text-terminal-green/20 cursor-not-allowed border border-terminal-green/5 bg-black/20"
                    style={{
                        clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))'
                    }}
                >
                    <Info className="w-4 h-4 mr-3 opacity-30" />
                    <div>
                        <div className="text-[11px] font-space font-black tracking-widest uppercase opacity-40">ABOUT</div>
                        <div className="text-[9px] font-mono opacity-20">System Info</div>
                    </div>
                </button>
            </div>

            {/* Footer Status */}
            <div className="p-3 border-t border-terminal-green/10 text-[10px] font-mono text-terminal-green/30 text-center">
                CONFIG_MODE_ACTIVE
            </div>
        </div>
    );
}
