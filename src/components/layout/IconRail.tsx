import { Archive, Terminal, Trash2, Settings, LucideIcon, Activity } from 'lucide-react';
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
    { id: 'backup', icon: Archive, label: 'Vault (Yedekleme)', enabled: true },
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
            className="w-12 h-full bg-black border-r border-terminal-green/20 flex flex-col items-center pt-2 pb-0 shrink-0"
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
                            "w-full h-10 flex items-center justify-center relative group transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-green focus-visible:ring-inset",

                            // Enabled states
                            item.enabled && !isActive && [
                                "text-terminal-green/60",
                                "hover:text-terminal-green/90 hover:bg-terminal-green/10",
                            ],

                            // Active state
                            isActive && [
                                "text-terminal-green bg-terminal-green/5 border-l-2 border-terminal-green",
                            ],

                            // Disabled state
                            !item.enabled && [
                                "text-terminal-green/20 cursor-not-allowed",
                            ]
                        )}
                    >
                        <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                    </button>
                );
            })}

            {/* Spacer */}
            <div className="flex-1" />



            {/* Settings always at bottom */}
            {/* Note: Settings is already in NAV_ITEMS, but we could move it here if needed */}
            {/* Bottom Items */}
            <div className="w-full flex flex-col items-center gap-0">
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
                                "w-full h-10 flex items-center justify-center relative group transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-green focus-visible:ring-inset",
                                item.enabled && !isActive && "text-terminal-green/60 hover:text-terminal-green/90 hover:bg-terminal-green/10",
                                isActive && "text-terminal-green bg-terminal-green/5 border-l-2 border-terminal-green",
                                !item.enabled && "text-terminal-green/20 cursor-not-allowed"
                            )}
                        >
                            <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
