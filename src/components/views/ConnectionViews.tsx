import { CheckCircle2 } from "lucide-react";
import { DeviceInfo } from "../../types/adb";

interface AppReadyViewProps {
    device?: DeviceInfo;
}

export function AppReadyView({ device }: AppReadyViewProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-terminal-green/60 space-y-6">
            <div className="relative">
                <CheckCircle2 className="w-16 h-16 text-terminal-green drop-shadow-[0_0_15px_rgba(34,197,94,0.6)] animate-pulse" />
                <div className="absolute inset-0 bg-terminal-green/20 blur-2xl rounded-full -z-10" />
            </div>
            <div className="text-center">
                <p className="text-sm font-space font-black text-white tracking-[0.3em] uppercase">Device Connected</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                    <span className="text-[10px] font-mono text-terminal-green/40 bg-terminal-green/5 border border-terminal-green/10 px-2 py-0.5">MODEL: {device?.model}</span>
                    <span className="text-[10px] font-mono text-terminal-green/40 bg-terminal-green/5 border border-terminal-green/10 px-2 py-0.5">ID: {device?.id}</span>
                </div>
            </div>
        </div>
    );
}

export function AppDisconnectedView() {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-terminal-green/60 space-y-6 z-20 pointer-events-none select-none">
            <div className="relative">
                <div className="w-20 h-20 border-2 border-terminal-green/20 rounded-full flex items-center justify-center animate-pulse">
                    <div className="w-10 h-10 border-2 border-terminal-green/40 rounded-full flex items-center justify-center animate-ping">
                        <div className="w-2 h-2 bg-terminal-green rounded-full shadow-[0_0_15px_#00ff41]" />
                    </div>
                </div>
            </div>
            <div className="text-center">
                <p className="text-sm font-space font-black text-white tracking-[0.2em] uppercase">Device Disconnected</p>
                <p className="text-[10px] font-mono text-terminal-green/30 mt-2">
                    Awaiting connection with device...
                </p>
            </div>
        </div>
    );
}
