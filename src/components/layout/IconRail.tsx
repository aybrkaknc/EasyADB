import { Archive, RotateCcw, Terminal, Trash2, Settings, LucideIcon, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ModuleType } from '../../context/AppContext';

/**
 * Icon Rail navigation item yapısı.
 */
interface NavItem {
    id: ModuleType;
    icon: LucideIcon;
    label: string;
    enabled: boolean;
}

/**
 * Navigasyon öğeleri tanımı.
 * Gelecekte yeni modüller buraya eklenir.
 */
const NAV_ITEMS: NavItem[] = [
    { id: 'backup', icon: Archive, label: 'Yedekleme', enabled: true },
    { id: 'restore', icon: RotateCcw, label: 'Geri Yükleme', enabled: true },
    { id: 'terminal', icon: Terminal, label: 'Terminal', enabled: true },
    { id: 'debloater', icon: Trash2, label: 'Debloater', enabled: true },
];

const BOTTOM_NAV_ITEMS: NavItem[] = [
    { id: 'performance', icon: Activity, label: 'Performans', enabled: true },
    { id: 'settings', icon: Settings, label: 'Ayarlar', enabled: true },
];

interface IconRailProps {
    activeModule: ModuleType;
    onModuleChange: (module: ModuleType) => void;
}

/**
 * IconRail: Sol kenar dikey navigasyon bileşeni.
 * ADB_UI tasarım sistemine uygun neon yeşil estetiği.
 */
export function IconRail({ activeModule, onModuleChange }: IconRailProps) {
    return (
        <nav
            className="w-12 h-full bg-black border-r border-terminal-green/20 flex flex-col items-center py-2 shrink-0"
            aria-label="Ana navigasyon"
        >
            {NAV_ITEMS.map((item) => {
                const isActive = activeModule === item.id;
                const Icon = item.icon;

                return (
                    <button
                        key={item.id}
                        onClick={() => item.enabled && onModuleChange(item.id)}
                        disabled={!item.enabled}
                        aria-label={item.label}
                        aria-current={isActive ? 'page' : undefined}
                        title={item.enabled ? item.label : `${item.label} (Yakında)`}
                        className={cn(
                            // Base
                            "w-10 h-10 flex items-center justify-center rounded-sm relative group",
                            "transition-all duration-150 ease-out",
                            // Focus accessibility
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-green focus-visible:ring-offset-2 focus-visible:ring-offset-black",

                            // Enabled states
                            item.enabled && !isActive && [
                                "text-terminal-green/40",
                                "hover:text-terminal-green/80 hover:bg-terminal-green/10",
                                "hover:scale-110",
                            ],

                            // Active state
                            isActive && [
                                "text-terminal-green",
                                "drop-shadow-[0_0_8px_rgba(0,255,65,0.6)]",
                            ],

                            // Disabled state
                            !item.enabled && [
                                "text-terminal-green/20 cursor-not-allowed",
                            ]
                        )}
                    >
                        {/* Active indicator line */}
                        {isActive && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-terminal-green rounded-r shadow-[0_0_8px_rgba(0,255,65,0.8)]" />
                        )}

                        <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                    </button>
                );
            })}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Bottom separator line */}
            <div className="w-6 h-px bg-terminal-green/20 mb-2" />

            {/* Settings always at bottom */}
            {/* Note: Settings is already in NAV_ITEMS, but we could move it here if needed */}
            {/* Bottom Items */}
            <div className="w-6 h-px bg-terminal-green/20 mb-2" />
            <div className="flex flex-col items-center gap-0">
                {BOTTOM_NAV_ITEMS.map((item) => {
                    const isActive = activeModule === item.id;
                    const Icon = item.icon;

                    return (
                        <button
                            key={item.id}
                            onClick={() => item.enabled && onModuleChange(item.id)}
                            disabled={!item.enabled}
                            aria-label={item.label}
                            aria-current={isActive ? 'page' : undefined}
                            title={item.enabled ? item.label : `${item.label} (Yakında)`}
                            className={cn(
                                "w-10 h-10 flex items-center justify-center rounded-sm relative group transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-green focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                                item.enabled && !isActive && "text-terminal-green/40 hover:text-terminal-green/80 hover:bg-terminal-green/10 hover:scale-110",
                                isActive && "text-terminal-green drop-shadow-[0_0_8px_rgba(0,255,65,0.6)]",
                                !item.enabled && "text-terminal-green/20 cursor-not-allowed"
                            )}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-terminal-green rounded-r shadow-[0_0_8px_rgba(0,255,65,0.8)]" />
                            )}
                            <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
