import { Activity, Battery, Cpu, Database, RefreshCw, Zap, Shield, Monitor, Layers, Terminal } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePerformanceMetrics, HWInfo } from '../../hooks/usePerformanceMetrics';

// =====================================================================
// PERFORMANCE SIDEBAR
// =====================================================================

export function PerformanceSidebar() {
    return (
        <div className="flex flex-col h-full bg-black">
            <div className="p-4 border-b border-terminal-green/20 bg-zinc-950/20">
                <h2 className="text-xs font-space font-black text-terminal-green tracking-[0.2em] flex items-center gap-2 uppercase">
                    <Activity className="w-3.5 h-3.5" />
                    TELEMETRY_LOG
                </h2>
                <p className="text-[9px] text-terminal-green/60 font-mono mt-1.5 uppercase tracking-tighter">
                    Active node synchronization
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div className="p-3 bg-terminal-green/5 border border-terminal-green/10 rounded-sm relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-terminal-green/10 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-3 h-3 text-terminal-green" />
                        <span className="text-[10px] font-space font-black text-terminal-green tracking-widest uppercase">STREAM_LINK</span>
                    </div>
                    <div className="text-[9px] text-zinc-400 font-mono leading-relaxed">
                        Data packets are sampled at <span className="text-terminal-green font-bold">1Hz</span>. Prolonged monitoring affects battery longevity.
                    </div>
                </div>
            </div>

            <div className="p-4 mt-auto border-t border-terminal-green/5 text-[8px] text-terminal-green/40 font-mono tracking-widest text-center uppercase">
                S_DATA_SUBSYSTEM v1.2
            </div>
        </div>
    );
}

// =====================================================================
// PERFORMANCE VIEW SUB-COMPONENTS
// =====================================================================

interface MetricCardProps {
    title: string;
    value: string | number;
    unit?: string;
    icon: any;
    color?: string;
    subtext?: string;
    glitch?: boolean;
}

function MetricCard({ title, value, unit, icon: Icon, color = "text-terminal-green", subtext, glitch }: MetricCardProps) {
    return (
        <div
            className={cn(
                "relative bg-zinc-950/40 border border-terminal-green/20 p-5 transition-all duration-500 group overflow-hidden",
                "hover:border-terminal-green/50 hover:bg-zinc-900/40 hover:shadow-[0_0_30px_rgba(0,255,65,0.05)]",
                glitch && "animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.15)] border-red-500/40"
            )}
            style={{
                clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))'
            }}
        >
            <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-terminal-green/30 group-hover:border-terminal-green" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-terminal-green/30 group-hover:border-terminal-green" />
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-terminal-green/10 to-transparent translate-y-[-100%] group-hover:translate-y-0 transition-transform duration-700" />

            <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col">
                    <span className="text-[10px] font-space font-black text-terminal-green tracking-[0.25em] uppercase">
                        {title}
                    </span>
                    <div className="h-[2px] w-6 bg-terminal-green/30 mt-1" />
                </div>
                <Icon className={cn("w-5 h-5 opacity-40 group-hover:opacity-100 transition-all duration-500 transform group-hover:scale-110", color)} />
            </div>

            <div className="flex items-baseline gap-1.5 mt-1">
                <span className={cn("text-4xl font-mono font-black tracking-tighter tabular-nums drop-shadow-[0_0_10px_rgba(0,255,65,0.2)]", color)}>
                    {value}
                </span>
                {unit && <span className="text-xs text-zinc-500 font-mono font-black tracking-widest">{unit}</span>}
            </div>

            {subtext && (
                <div className="text-[9px] text-zinc-400 font-mono mt-3 flex items-center gap-2 uppercase tracking-widest">
                    <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", color.replace('text-', 'bg-'))} />
                    {subtext}
                </div>
            )}
        </div>
    );
}

function HardwareInfo({ info }: { info?: HWInfo }) {
    if (!info) {
        return (
            <div className="lg:col-span-2 relative bg-zinc-950/40 border border-terminal-green/20 p-8 flex flex-col items-center justify-center gap-4">
                <RefreshCw className="w-8 h-8 text-terminal-green/20 animate-spin" />
                <span className="text-[10px] font-space font-black text-terminal-green/40 animate-pulse uppercase tracking-[0.3em]">INITIALIZING_HW_LINK...</span>
            </div>
        );
    }

    const groups = [
        {
            title: "SYSTEM_SILICON",
            icon: Cpu,
            items: [
                { label: 'CPU_PLATFORM', val: info.soc },
                { label: 'ARCHITECTURE', val: info.cpu_abi },
                { label: 'GPU_RENDERER', val: info.gpu_renderer, highlight: true }
            ]
        },
        {
            title: "CORE_SUBSYSTEM",
            icon: Terminal,
            items: [
                { label: 'NODE_VERSION', val: `v${info.android_ver} (SDK ${info.sdk_ver})` },
                { label: 'KERNEL_ID', val: info.kernel },
                { label: 'SEC_PATCH', val: info.security_patch }
            ]
        },
        {
            title: "DISPLAY_PANEL",
            icon: Monitor,
            items: [
                { label: 'RESOLUTION', val: info.resolution },
                { label: 'PIXEL_DENSITY', val: info.density }
            ]
        },
        {
            title: "NODE_TAGS",
            icon: Layers,
            items: [
                { label: 'PRODUCT_ID', val: info.model },
                { label: 'BUILD_REV', val: info.build_id },
                { label: 'SERIAL_NUM', val: info.serial }
            ]
        }
    ];

    return (
        <div className="lg:col-span-2 space-y-4">
            <div className="relative bg-zinc-950/60 border border-terminal-green/20 p-8 overflow-hidden group">
                {/* Aesthetic Detail Icons */}
                <div className="absolute top-0 right-0 p-3 opacity-10 flex gap-4 grayscale group-hover:grayscale-0 transition-all duration-700">
                    <Shield className="w-8 h-8 text-terminal-green/20 rotate-12" />
                </div>

                <h3 className="text-xs font-space font-black text-terminal-green tracking-[0.3em] mb-10 flex items-center gap-3">
                    <div className="w-2 h-2 bg-terminal-green animate-pulse" />
                    HW_INVENTORY_REPORT_V2.1
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12 relative z-10">
                    {groups.map((group) => (
                        <div key={group.title} className="space-y-5">
                            <div className="flex items-center gap-2.5 border-b border-terminal-green/5 pb-2">
                                <group.icon className="w-3.5 h-3.5 text-terminal-green/50" />
                                <span className="text-[10px] font-space font-black text-terminal-green tracking-[0.2em] uppercase">{group.title}</span>
                            </div>
                            <div className="space-y-5 pl-1">
                                {group.items.map((item) => (
                                    <div key={item.label} className="flex flex-col gap-1 hover:translate-x-1 transition-transform duration-300">
                                        <span className="text-[9px] font-mono text-zinc-500 hover:text-zinc-400 font-bold tracking-widest uppercase">{item.label}</span>
                                        <span className={cn(
                                            "text-[11px] font-space font-black tracking-wider uppercase truncate",
                                            item.highlight
                                                ? "text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]"
                                                : "text-terminal-green drop-shadow-[0_0_5px_rgba(0,255,65,0.15)]"
                                        )}>
                                            {item.val || 'N/A'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="absolute bottom-[-15%] right-[-10%] rotate-[-20deg] opacity-[0.03] pointer-events-none select-none">
                    <Cpu className="w-80 h-80 text-terminal-green" />
                </div>
            </div>
        </div>
    );
}

function TelemetrySpecs({ uptime }: { uptime: string }) {
    return (
        <div className="bg-zinc-950/60 border border-terminal-green/20 p-8 flex flex-col justify-between group overflow-hidden relative">
            <div className="absolute top-0 right-0 w-16 h-16 bg-terminal-green/5 blur-3xl rounded-full" />
            <div>
                <h3 className="text-[10px] font-space font-black text-terminal-green tracking-[0.25em] mb-8 uppercase">NODE_UPTIME</h3>
                <div className="text-4xl font-mono font-black text-terminal-green tracking-tighter drop-shadow-[0_0_15px_rgba(0,255,65,0.3)] tabular-nums">
                    {uptime}
                </div>
                <p className="text-[10px] text-zinc-400 font-mono mt-6 leading-relaxed uppercase tracking-tight">
                    Link integrity verified. Sub-atomic packet routing is <span className="text-terminal-green">OPTIMAL</span>. No kernel vectors detected.
                </p>
            </div>

            <div className="mt-12 space-y-3">
                {[
                    { label: 'NODE_STAT', val: 'ADB_LIVE', icon: Terminal },
                    { label: 'KERNEL_ENV', val: 'LNX_AARCH64', icon: Cpu },
                    { label: 'SEC_STATUS', val: 'VAULT_LOCK', icon: Shield }
                ].map(spec => (
                    <div key={spec.label} className="flex justify-between items-center text-[10px] font-mono group/item">
                        <div className="flex items-center gap-3">
                            <spec.icon className="w-3 h-3 text-terminal-green/30 group-hover/item:text-terminal-green transition-colors" />
                            <span className="text-zinc-500 font-bold tracking-widest">{spec.label}</span>
                        </div>
                        <span className="text-terminal-green font-black">{spec.val}</span>
                    </div>
                ))}
                <div className="w-full h-px bg-terminal-green/10 my-4" />
                <div className="text-[9px] font-mono text-terminal-green/40 text-center animate-pulse tracking-[0.3em] font-black uppercase">
                    SECTOR_07_LINKED
                </div>
            </div>
        </div>
    );
}

export function PerformanceView({ deviceId }: { deviceId?: string }) {
    const { metrics, isLoading, refresh } = usePerformanceMetrics(deviceId);

    if (!deviceId) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-terminal-green/60 space-y-6 font-space p-12">
                <div className="relative">
                    <Activity className="w-16 h-16 text-terminal-green/10 animate-pulse" />
                    <div className="absolute inset-0 bg-terminal-green/20 blur-2xl animate-pulse" />
                </div>
                <div className="text-center">
                    <p className="text-lg font-black text-white tracking-[0.4em] uppercase mb-2">TELEMETRY_OFFLINE</p>
                    <p className="text-xs text-terminal-green/40 font-mono tracking-widest uppercase">Awaiting physical node connection...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-black relative overflow-hidden">
            {/* CRUNCHY GRID BACKGROUND */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.15] z-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,65,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,65,0.1)_1px,transparent_1px)] bg-[size:40px_40px]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,65,0.05)_1px,transparent_1px)] bg-[size:100%_4px]" />
            </div>

            <div className="flex-1 p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-terminal-green/10 z-10 relative">
                <div className="max-w-6xl mx-auto w-full">
                    {/* Header HUD - Fixed Layout (No sticky overlap) */}
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-16 border-b border-terminal-green/20 pb-10 relative">
                        <div className="flex flex-col gap-3">
                            <h1 className="text-4xl font-space font-black text-white tracking-[0.2em] flex items-center gap-5 uppercase">
                                <div className="relative">
                                    <Activity className="w-10 h-10 text-terminal-green drop-shadow-[0_0_12px_#00ff41]" />
                                    <div className="absolute inset-0 bg-terminal-green/30 blur-2xl animate-pulse" />
                                </div>
                                S_Monitor_HUD_0.2
                            </h1>
                            <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.2em]">
                                <span className="text-white bg-terminal-green/20 px-2 py-0.5 border border-terminal-green/40 font-black">LINK_ESTABLISHED</span>
                                <span className="text-zinc-500 uppercase font-black">NODE_ID://{deviceId}</span>
                            </div>
                        </div>

                        <div className="mt-6 md:mt-0">
                            <button onClick={refresh} className="p-4 border border-terminal-green/30 bg-zinc-950/80 hover:border-terminal-green hover:bg-terminal-green/10 text-terminal-green transition-all overflow-hidden group relative shadow-2xl">
                                <div className="absolute inset-0 bg-terminal-green/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                                <RefreshCw className={cn("w-6 h-6 relative z-10 drop-shadow-[0_0_8px_rgba(0,255,65,0.5)]", isLoading && "animate-spin")} />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                        <MetricCard title="Battery" value={metrics.batteryLevel} unit="%" icon={Battery} subtext="PACK: INTEGRATED" color={metrics.batteryLevel < 20 ? "text-red-500" : "text-terminal-green"} />
                        <MetricCard title="CPU_Temp" value={metrics.batteryTemp} unit="°C" icon={Zap} subtext="THRM: SAFE_ZONE" color={metrics.batteryTemp > 45 ? "text-orange-500" : "text-emerald-400"} />
                        <MetricCard title="Proc_Load" value={metrics.cpuUsage} unit="%" icon={Cpu} subtext="FREQ: OSCILLATING" />
                        <MetricCard title="Memory_Map" value={metrics.ramUsage} unit="%" icon={Database} subtext="ADDR: VIRTUAL" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                        <HardwareInfo info={metrics.hwInfo} />
                        <TelemetrySpecs uptime={metrics.uptime} />
                    </div>
                </div>
            </div>
        </div>
    );
}
