import { cn } from "../lib/utils";

interface HeaderProps {
    deviceConnected: boolean;
    isRooted?: boolean;
    className?: string;
}

export function Header({ deviceConnected: _deviceConnected, isRooted: _isRooted = false, className }: HeaderProps) {
    return (
        <header className={cn("flex items-center justify-center px-6 py-4 border-b border-terminal-green/30 bg-black/60 backdrop-blur-xl z-20 shadow-[0_0_20px_rgba(0,255,65,0.1)]", className)}>
            <div className="flex items-center">
                <h1 className="text-lg font-black text-terminal-green tracking-[0.2em] transform -skew-x-12 drop-shadow-[0_0_15px_rgba(0,255,65,0.8)]">
                    EASY_BACKUP
                </h1>
            </div>
        </header>
    );
}
