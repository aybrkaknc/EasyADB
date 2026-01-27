import { cn } from '../../lib/utils';
import { Settings, Info } from 'lucide-react';

interface SettingsModuleProps {
    activeTab: 'general' | 'about';
    bgStyle?: string;
    onTabChange: (tab: 'general' | 'about') => void;
}

/**
 * SettingsModule: Ayarlar menüsü yan paneli.
 * Artık sadece General ve About sekmeleri var.
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
                {/* General Option */}
                <button
                    onClick={() => onTabChange('general')}
                    className={cn(
                        "relative w-full flex items-center p-3 text-left transition-all group overflow-hidden border",
                        activeTab === 'general'
                            ? "bg-terminal-green/10 border-terminal-green/50 text-terminal-green"
                            : "bg-black/40 border-terminal-green/10 text-terminal-green/60 hover:border-terminal-green/30 hover:bg-terminal-green/5"
                    )}
                    style={{
                        clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))'
                    }}
                >
                    <div className="absolute inset-0 w-full h-[1px] bg-terminal-green/20 -translate-y-full group-hover:animate-scanline pointer-events-none" />
                    <Settings className="w-4 h-4 mr-3 relative z-10" />
                    <div className="relative z-10 flex-1">
                        <div className="text-[11px] font-space font-black tracking-widest uppercase">GENERAL_CONFIG</div>
                        <div className="text-[9px] font-mono opacity-50">Preferences & Storage</div>
                    </div>
                    {activeTab === 'general' && (
                        <div className="ml-2 w-1.5 h-1.5 bg-terminal-green rotate-45 shadow-[0_0_8px_rgba(0,255,65,1)]" />
                    )}
                </button>

                {/* About Option */}
                <button
                    onClick={() => onTabChange('about')}
                    className={cn(
                        "relative w-full flex items-center p-3 text-left transition-all group overflow-hidden border",
                        activeTab === 'about'
                            ? "bg-terminal-green/10 border-terminal-green/50 text-terminal-green"
                            : "bg-black/40 border-terminal-green/10 text-terminal-green/60 hover:border-terminal-green/30 hover:bg-terminal-green/5"
                    )}
                    style={{
                        clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))'
                    }}
                >
                    <div className="absolute inset-0 w-full h-[1px] bg-terminal-green/20 -translate-y-full group-hover:animate-scanline pointer-events-none" />
                    <Info className="w-4 h-4 mr-3 relative z-10" />
                    <div className="relative z-10 flex-1">
                        <div className="text-[11px] font-space font-black tracking-widest uppercase">ABOUT</div>
                        <div className="text-[9px] font-mono opacity-50">Version & Credits</div>
                    </div>
                    {activeTab === 'about' && (
                        <div className="ml-2 w-1.5 h-1.5 bg-terminal-green rotate-45 shadow-[0_0_8px_rgba(0,255,65,1)]" />
                    )}
                </button>
            </div>
        </div>
    );
}
