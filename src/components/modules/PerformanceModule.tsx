import { useState } from 'react';
import { Activity, Battery, Cpu, Database, RefreshCw, Zap, Shield, Monitor, Layers, Terminal, Lock, Unlock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePerformanceMetrics, HWInfo, DeviceIntegrity } from '../../hooks/usePerformanceMetrics';



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
                "relative bg-zinc-950/40 border border-terminal-green/20 px-5 py-4 flex-1 flex flex-col justify-center transition-all duration-500 group overflow-hidden min-h-[85px]",
                "hover:border-terminal-green/50 hover:bg-zinc-900/40 hover:shadow-[0_0_30px_rgba(0,255,65,0.05)]",
                glitch && "animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.15)] border-red-500/40"
            )}
            style={{
                clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))'
            }}
        >
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-terminal-green/30 group-hover:border-terminal-green" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-terminal-green/30 group-hover:border-terminal-green" />

            <div className="flex items-center justify-between w-full mt-1">
                <div className="flex items-center gap-4">
                    <div className={cn("p-2 bg-zinc-950 border border-white/5 rounded-none transition-all duration-500 group-hover:border-terminal-green/30", color.replace('text-', 'text-'))}>
                        <Icon className="w-5 h-5 opacity-70 group-hover:opacity-100" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[14px] font-space font-black text-terminal-green tracking-[0.25em] uppercase">
                            {title}
                        </span>
                        {subtext && (
                            <div className="text-[8px] text-zinc-500 font-mono flex items-center gap-1.5 uppercase tracking-widest mt-0.5">
                                <div className={cn("w-1 h-1 rounded-full animate-pulse", color.replace('text-', 'bg-'))} />
                                {subtext}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-baseline gap-1.5 min-w-fit pl-4">
                    <span className={cn("text-3xl font-mono font-black tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]", color)}>
                        {value}
                    </span>
                    {unit && <span className="text-[10px] text-zinc-600 font-mono font-black tracking-widest uppercase">{unit}</span>}
                </div>
            </div>
        </div>
    );
}

function HardwareInfo({ info }: { info?: HWInfo }) {
    if (!info) {
        return (
            <div className="lg:col-span-2 relative bg-zinc-950/40 border border-terminal-green/20 p-8 flex flex-col items-center justify-center gap-4">
                <RefreshCw className="w-8 h-8 text-terminal-green/20 animate-spin" />
                <span className="text-[10px] font-space font-black text-terminal-green/40 animate-pulse uppercase tracking-[0.3em]">CONNECTING DEVICE...</span>
            </div>
        );
    }

    const groups = [
        {
            title: "SYSTEM CHIPSET",
            icon: Cpu,
            items: [
                { label: 'PLATFORM', val: info.soc },
                { label: 'ARCHITECTURE', val: info.cpu_abi },
                { label: 'GPU RENDERER', val: info.gpu_renderer, highlight: true }
            ]
        },
        {
            title: "OS INFORMATION",
            icon: Terminal,
            items: [
                { label: 'ANDROID VERSION', val: `v${info.android_ver} (SDK ${info.sdk_ver})` },
                { label: 'KERNEL ID', val: info.kernel },
                { label: 'SECURITY PATCH', val: info.security_patch }
            ]
        },
        {
            title: "DISPLAY PANEL",
            icon: Monitor,
            items: [
                { label: 'RESOLUTION', val: info.resolution },
                { label: 'PIXEL DENSITY', val: info.density }
            ]
        },
        {
            title: "DEVICE IDENTITY",
            icon: Layers,
            items: [
                { label: 'MODEL ID', val: info.model },
                { label: 'BUILD VERSION', val: info.build_id },
                { label: 'SERIAL NUMBER', val: info.serial }
            ]
        }
    ];

    return (
        <div className="relative bg-zinc-950/60 border border-terminal-green/20 p-6 h-full overflow-hidden group">
            {/* Aesthetic Detail Icons */}
            <div className="absolute top-0 right-0 p-3 opacity-10 flex gap-4 grayscale group-hover:grayscale-0 transition-all duration-700">
                <Shield className="w-8 h-8 text-terminal-green/20 rotate-12" />
            </div>

            <div className="flex items-center justify-between mb-8 shrink-0">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-2 h-2 bg-terminal-green animate-pulse" />
                    <h3 className="text-xs font-space font-black text-terminal-green tracking-[0.3em] uppercase">Hardware Inventory</h3>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 relative z-10">
                {groups.map((group) => (
                    <div key={group.title} className="flex flex-col justify-center border-l border-terminal-green/10 pl-5 hover:border-terminal-green transition-colors">
                        <div className="flex items-center gap-2 mb-3">
                            <group.icon className="w-4 h-4 text-terminal-green/50" />
                            <span className="text-[11px] font-space font-black text-terminal-green/80 tracking-[0.2em] uppercase">{group.title}</span>
                        </div>
                        <div className="space-y-3 pl-1">
                            {group.items.slice(0, 2).map((item) => (
                                <div key={item.label} className="flex flex-col gap-1 hover:translate-x-1 transition-transform duration-300">
                                    <span className="text-[10px] font-mono text-zinc-500 font-bold tracking-widest uppercase">{item.label}</span>
                                    <span className={cn(
                                        "text-[13px] font-mono font-black tracking-wider uppercase truncate",
                                        item.highlight ? "text-white" : "text-terminal-green"
                                    )}>
                                        {item.val || 'N/A'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="absolute bottom-[-10%] right-[-5%] rotate-[-20deg] opacity-[0.02] pointer-events-none select-none">
                <Cpu className="w-64 h-64 text-terminal-green" />
            </div>
        </div>
    );
}

function IntegrityCard({ integrity }: { integrity?: DeviceIntegrity }) {
    if (!integrity) {
        return (
            <div className="relative bg-zinc-950/40 border border-terminal-green/20 p-6 h-full flex flex-col items-center justify-center gap-4">
                <RefreshCw className="w-8 h-8 text-terminal-green/20 animate-spin" />
                <span className="text-[10px] font-space font-black text-terminal-green/40 animate-pulse uppercase tracking-[0.3em]">SCANNING...</span>
            </div>
        );
    }

    const statusConfig = {
        STRONG: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: CheckCircle, label: 'STRONG' },
        BASIC: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: AlertTriangle, label: 'BASIC' },
        FAIL: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: XCircle, label: 'FAIL' }
    };

    const config = statusConfig[integrity.status as keyof typeof statusConfig] || statusConfig.FAIL;
    const StatusIcon = config.icon;

    // Extract individual checks from details array
    const getCheckStatus = (keyword: string) => {
        const detail = integrity.details.find(d => d.toLowerCase().includes(keyword.toLowerCase()));
        return detail ? detail.includes('✓') : false;
    };

    const checks = [
        {
            label: 'BOOTLOADER',
            pass: integrity.bootloader_locked,
            icon: integrity.bootloader_locked ? Lock : Unlock,
            value: integrity.bootloader_locked ? 'LOCKED' : 'UNLOCKED',
            desc: integrity.bootloader_locked ? 'Factory sealed, tamper-proof' : 'Custom firmware allowed'
        },
        {
            label: 'VERIFIED BOOT',
            pass: integrity.verified_boot === 'green',
            icon: Shield,
            value: integrity.verified_boot.toUpperCase(),
            desc: integrity.verified_boot === 'green' ? 'OEM signature verified' : 'Boot chain modified'
        },
        {
            label: 'SELINUX',
            pass: getCheckStatus('selinux'),
            icon: Shield,
            value: getCheckStatus('selinux') ? 'ENFORCING' : 'PERMISSIVE',
            desc: getCheckStatus('selinux') ? 'Mandatory access control active' : 'Security policies relaxed'
        },
        {
            label: 'DEBUG MODE',
            pass: !getCheckStatus('debug'),
            icon: Terminal,
            value: getCheckStatus('debug') ? 'ON' : 'OFF',
            desc: !getCheckStatus('debug') ? 'Production environment' : 'Developer access enabled'
        }
    ];

    return (
        <div className={cn(
            "relative border p-6 h-full flex flex-col transition-all duration-500 group overflow-hidden",
            config.bg,
            config.border
        )}>
            <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-current opacity-30" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-current opacity-30" />

            {/* Header with Status Badge Right-Aligned */}
            <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-3 px-2">
                    <Shield className={cn("w-4 h-4", config.color)} />
                    <h3 className="text-[10px] font-space font-black text-terminal-green tracking-[0.3em] uppercase">Device Integrity</h3>
                </div>
                <div className={cn(
                    "flex items-center gap-1.5 px-2 py-1 border",
                    config.bg,
                    config.border
                )}>
                    <StatusIcon className={cn("w-3.5 h-3.5", config.color)} />
                    <span className={cn("text-[9px] font-space font-black tracking-wider", config.color)}>{config.label}</span>
                </div>
            </div>

            {/* 4 Check Boxes - Each aligned with corresponding row */}
            <div className="grid grid-cols-1 gap-4 flex-1">
                {checks.map((check, idx) => {
                    const CheckIcon = check.icon;
                    return (
                        <div
                            key={idx}
                            className={cn(
                                "h-[100px] flex items-center gap-3 px-4 border transition-all hover:translate-x-1",
                                "bg-zinc-950/40",
                                check.pass ? "border-emerald-500/20" : "border-red-500/20"
                            )}
                            style={{
                                clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))'
                            }}
                        >
                            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-terminal-green/30" />
                            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-terminal-green/30" />

                            <CheckIcon className={cn(
                                "w-5 h-5 shrink-0",
                                check.pass ? "text-emerald-400" : "text-red-400"
                            )} />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[8px] font-mono text-zinc-500 font-bold tracking-widest uppercase">{check.label}</span>
                                <span className={cn(
                                    "text-base font-mono font-black tracking-wider",
                                    check.pass ? "text-emerald-400" : "text-red-400"
                                )}>
                                    {check.value}
                                </span>
                            </div>
                            <div className="ml-auto flex flex-col items-end gap-1">
                                <div className={cn(
                                    "w-1.5 h-1.5 rounded-full animate-pulse",
                                    check.pass ? "bg-emerald-400" : "bg-red-400"
                                )} />
                                <span className="text-[8px] font-mono text-white/80 uppercase tracking-wider text-right max-w-[110px] leading-tight">
                                    {check.desc}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function PerformanceView({ deviceId }: { deviceId?: string }) {
    const { metrics, isLoading, refresh } = usePerformanceMetrics(deviceId);
    const [expandedSection, setExpandedSection] = useState<'status' | 'hardware' | 'integrity'>('status');

    if (!deviceId) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-terminal-green/60 space-y-6 font-space p-12">
                <div className="relative">
                    <Activity className="w-16 h-16 text-terminal-green/10 animate-pulse" />
                    <div className="absolute inset-0 bg-terminal-green/20 blur-2xl animate-pulse" />
                </div>
                <div className="text-center">
                    <p className="text-lg font-black text-white tracking-[0.4em] uppercase mb-2">SYSTEM OFFLINE</p>
                    <p className="text-xs text-terminal-green/40 font-mono tracking-widest uppercase">Awaiting device connection...</p>
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

            <div className="flex-1 p-6 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-terminal-green/10 z-10 relative">
                {/* Header HUD - Compact Layout */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 border-b border-terminal-green/20 pb-6 relative -mx-6 px-6">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 mb-2">
                            <Activity className="w-6 h-6 text-terminal-green" />
                            <h1 className="text-2xl font-space font-black text-white tracking-[0.2em] drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">SYSTEM MONITOR</h1>
                        </div>
                        <div className="text-[10px] text-white/80 font-mono tracking-widest uppercase">
                            REAL-TIME DEVICE METRICS AND INTEGRITY STATUS
                        </div>
                    </div>

                    <div className="mt-4 md:mt-0">
                        <button onClick={refresh} className="p-3 border border-terminal-green/30 bg-zinc-950/80 hover:border-terminal-green hover:bg-terminal-green/10 text-terminal-green transition-all overflow-hidden group relative shadow-2xl">
                            <div className="absolute inset-0 bg-terminal-green/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                            <RefreshCw className={cn("w-5 h-5 relative z-10 drop-shadow-[0_0_8px_rgba(0,255,65,0.5)]", isLoading && "animate-spin")} />
                        </button>
                    </div>
                </div>

                {/* Desktop: 3-Column Grid */}
                <div className="hidden lg:grid grid-cols-3 gap-8 items-stretch">
                    <div className="h-full">
                        <div className="relative bg-zinc-950/60 border border-terminal-green/20 p-6 h-full overflow-hidden group flex flex-col">
                            <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-terminal-green/30 group-hover:border-terminal-green transition-colors" />
                            <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-terminal-green/30 group-hover:border-terminal-green transition-colors" />

                            <div className="flex items-center justify-between mb-6 shrink-0">
                                <div className="flex items-center gap-3 px-2">
                                    <Activity className="w-4 h-4 text-terminal-green" />
                                    <h3 className="text-[10px] font-space font-black text-terminal-green tracking-[0.3em] uppercase">System Status</h3>
                                </div>
                            </div>

                            <div className="flex flex-col gap-4 flex-1">
                                <MetricCard title="Battery" value={metrics.batteryLevel} unit="%" icon={Battery} subtext="STAT: CONNECTED" color={metrics.batteryLevel < 20 ? "text-red-500" : "text-terminal-green"} />
                                <MetricCard title="Temperature" value={metrics.batteryTemp} unit="°C" icon={Zap} subtext="STATUS: OK" color={metrics.batteryTemp > 45 ? "text-orange-500" : "text-emerald-400"} />
                                <MetricCard title="CPU Load" value={metrics.cpuUsage} unit="%" icon={Cpu} subtext="ACTIVE" />
                                <MetricCard title="RAM Usage" value={metrics.ramUsage} unit="%" icon={Database} subtext="MAP: DYNAMIC" />
                            </div>
                        </div>
                    </div>

                    <div className="h-full">
                        <HardwareInfo info={metrics.hwInfo} />
                    </div>

                    <div className="h-full">
                        <IntegrityCard integrity={metrics.integrity} />
                    </div>
                </div>

                {/* Mobile/Tablet: Horizontal Expansion Accordion */}
                <div className="lg:hidden flex flex-row h-[calc(100vh-200px)] min-h-[500px] gap-1">
                    {/* System Status Panel */}
                    <div
                        onClick={() => setExpandedSection('status')}
                        className={cn(
                            "border border-terminal-green/20 bg-zinc-950/60 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-pointer flex flex-col",
                            expandedSection === 'status' ? "flex-[3] border-terminal-green/40" : "flex-[0.5] hover:bg-white/5"
                        )}
                    >
                        {/* Header - Only when collapsed */}
                        {expandedSection !== 'status' && (
                            <div className="shrink-0 p-2 justify-center h-full flex items-center">
                                <div className="flex flex-col items-center gap-3 py-4">
                                    <Activity className="w-5 h-5 text-zinc-500" />
                                    <span className="text-[9px] font-space font-black text-zinc-500 tracking-[0.15em] uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                        STATUS
                                    </span>
                                    <div className="mt-auto flex flex-col items-center gap-1 text-[8px] font-mono text-zinc-600">
                                        <Battery className="w-3 h-3 text-terminal-green/50" />
                                        <span>{metrics.batteryLevel}%</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Content - Only when expanded */}
                        {expandedSection === 'status' && (
                            <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 animate-in fade-in slide-in-from-left-4 duration-300">
                                {/* Inline Header for Status */}
                                <div className="flex items-center gap-3 mb-2 pb-3 border-b border-terminal-green/20">
                                    <Activity className="w-5 h-5 text-terminal-green" />
                                    <span className="text-xs font-space font-black text-terminal-green tracking-[0.2em] uppercase">System Status</span>
                                    <div className="ml-auto flex items-center gap-2 text-[9px] font-mono text-zinc-500">
                                        <span>{metrics.batteryLevel}%</span>
                                        <span className="text-zinc-600">•</span>
                                        <span>{metrics.cpuUsage}% CPU</span>
                                    </div>
                                </div>
                                <MetricCard title="Battery" value={metrics.batteryLevel} unit="%" icon={Battery} subtext="STAT: CONNECTED" color={metrics.batteryLevel < 20 ? "text-red-500" : "text-terminal-green"} />
                                <MetricCard title="Temperature" value={metrics.batteryTemp} unit="°C" icon={Zap} subtext="STATUS: OK" color={metrics.batteryTemp > 45 ? "text-orange-500" : "text-emerald-400"} />
                                <MetricCard title="CPU Load" value={metrics.cpuUsage} unit="%" icon={Cpu} subtext="ACTIVE" />
                                <MetricCard title="RAM Usage" value={metrics.ramUsage} unit="%" icon={Database} subtext="MAP: DYNAMIC" />
                            </div>
                        )}
                    </div>

                    {/* Hardware Inventory Panel */}
                    <div
                        onClick={() => setExpandedSection('hardware')}
                        className={cn(
                            "border border-terminal-green/20 bg-zinc-950/60 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-pointer flex flex-col",
                            expandedSection === 'hardware' ? "flex-[3] border-terminal-green/40" : "flex-[0.5] hover:bg-white/5"
                        )}
                    >
                        {/* Header - Only when collapsed */}
                        {expandedSection !== 'hardware' && (
                            <div className="shrink-0 p-2 justify-center h-full flex items-center">
                                <div className="flex flex-col items-center gap-3 py-4">
                                    <Cpu className="w-5 h-5 text-zinc-500" />
                                    <span className="text-[9px] font-space font-black text-zinc-500 tracking-[0.15em] uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                        HARDWARE
                                    </span>
                                    <div className="mt-auto flex flex-col items-center gap-1 text-[8px] font-mono text-zinc-600">
                                        <Monitor className="w-3 h-3 text-terminal-green/50" />
                                        <span className="text-center leading-tight">{metrics.hwInfo?.android_ver || '?'}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Content - Only when expanded */}
                        {expandedSection === 'hardware' && (
                            <div className="flex-1 p-4 overflow-y-auto animate-in fade-in slide-in-from-left-4 duration-300">
                                <HardwareInfo info={metrics.hwInfo} />
                            </div>
                        )}
                    </div>

                    {/* Device Integrity Panel */}
                    <div
                        onClick={() => setExpandedSection('integrity')}
                        className={cn(
                            "border border-terminal-green/20 bg-zinc-950/60 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-pointer flex flex-col",
                            expandedSection === 'integrity' ? "flex-[3] border-terminal-green/40" : "flex-[0.5] hover:bg-white/5"
                        )}
                    >
                        {/* Header - Only when collapsed */}
                        {expandedSection !== 'integrity' && (
                            <div className="shrink-0 p-2 justify-center h-full flex items-center">
                                <div className="flex flex-col items-center gap-3 py-4">
                                    <Shield className="w-5 h-5 text-zinc-500" />
                                    <span className="text-[9px] font-space font-black text-zinc-500 tracking-[0.15em] uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                        INTEGRITY
                                    </span>
                                    <div className="mt-auto flex flex-col items-center gap-1">
                                        <Lock className={cn("w-3 h-3", metrics.integrity?.bootloader_locked ? "text-emerald-400" : "text-red-400")} />
                                        <span className={cn("text-[8px] font-mono", metrics.integrity?.bootloader_locked ? "text-emerald-400" : "text-red-400")}>
                                            {metrics.integrity?.bootloader_locked ? 'OK' : '!'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Content - Only when expanded */}
                        {expandedSection === 'integrity' && (
                            <div className="flex-1 p-4 overflow-y-auto animate-in fade-in slide-in-from-left-4 duration-300">
                                <IntegrityCard integrity={metrics.integrity} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

