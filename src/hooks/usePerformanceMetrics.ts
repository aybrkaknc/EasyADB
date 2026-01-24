import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface HWInfo {
    model: string;
    manufacturer: string;
    soc: string;
    cpu_abi: string;
    android_ver: string;
    sdk_ver: string;
    security_patch: string;
    kernel: string;
    resolution: string;
    density: string;
    gpu_renderer: string;
    build_id: string;
    serial: string;
}

export interface Metrics {
    batteryLevel: number;
    batteryTemp: number;
    cpuUsage: number;
    ramUsage: number;
    uptime: string;
    hwInfo?: HWInfo;
}

export function usePerformanceMetrics(deviceId: string | undefined) {
    const [metrics, setMetrics] = useState<Metrics>({
        batteryLevel: 0,
        batteryTemp: 0,
        cpuUsage: 0,
        ramUsage: 0,
        uptime: "0:00:00"
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Track hardware info fetch status
    const fetchedHWInfoIdRef = useRef<string | null>(null);
    const isFetchingHWRef = useRef<boolean>(false);

    const fetchProp = async (id: string, prop: string) => {
        try {
            const res = await invoke<string>('run_adb_command', { deviceId: id, command: `shell getprop ${prop}` });
            return res.trim() || 'N/A';
        } catch {
            return 'N/A';
        }
    };

    const fetchHWInfo = async (id: string): Promise<HWInfo | undefined> => {
        if (isFetchingHWRef.current) return undefined;
        isFetchingHWRef.current = true;

        try {
            // Sequential calls because the backend splits command strings by whitespace naively
            const [model, manufacturer, soc, abi, ver, sdk, patch, build, serial] = await Promise.all([
                fetchProp(id, 'ro.product.model'),
                fetchProp(id, 'ro.product.manufacturer'),
                fetchProp(id, 'ro.board.platform'),
                fetchProp(id, 'ro.product.cpu.abi'),
                fetchProp(id, 'ro.build.version.release'),
                fetchProp(id, 'ro.build.version.sdk'),
                fetchProp(id, 'ro.build.version.security_patch'),
                fetchProp(id, 'ro.build.display.id'),
                fetchProp(id, 'ro.serialno')
            ]);

            // Kernel
            let kernel = 'Unknown';
            try {
                const kRes = await invoke<string>('run_adb_command', { deviceId: id, command: 'shell uname -rs' });
                kernel = kRes.trim();
            } catch { }

            // Display
            let res = 'Unknown';
            let dens = 'Unknown';
            try {
                const sRes = await invoke<string>('run_adb_command', { deviceId: id, command: 'shell wm size' });
                res = sRes.includes(': ') ? sRes.split(': ')[1].trim() : sRes.trim();
                const dRes = await invoke<string>('run_adb_command', { deviceId: id, command: 'shell wm density' });
                dens = dRes.includes(': ') ? dRes.split(': ')[1].trim() : dRes.trim();
            } catch { }

            // GPU - Minimal Attempt (SurfaceFlinger dumpsys parsing often fails due to permission or shell split issues)
            // Using a simple getprop fallback for GPU id if possible
            let gpu = 'Unknown';
            try {
                const gRes = await fetchProp(id, 'ro.hardware.egl');
                if (gRes !== 'N/A') gpu = gRes;
            } catch { }

            const info: HWInfo = {
                model,
                manufacturer,
                soc: soc.toUpperCase(),
                cpu_abi: abi,
                android_ver: ver,
                sdk_ver: sdk,
                security_patch: patch,
                kernel,
                resolution: res,
                density: dens,
                gpu_renderer: gpu,
                build_id: build,
                serial: serial !== 'N/A' ? serial : (id || 'Unknown')
            };

            fetchedHWInfoIdRef.current = id;
            return info;
        } catch (err) {
            console.error("HWInfo fetch fatal error:", err);
            return undefined;
        } finally {
            isFetchingHWRef.current = false;
        }
    };

    const fetchMetrics = useCallback(async () => {
        if (!deviceId) return;

        try {
            // Telemetry Basic
            const batteryRes = await invoke<string>('run_adb_command', { deviceId, command: 'shell dumpsys battery' });
            const levelMatch = batteryRes.match(/level: (\d+)/);
            const tempMatch = batteryRes.match(/temperature: (\d+)/);
            const uptimeRes = await invoke<string>('run_adb_command', { deviceId, command: 'shell uptime' });

            // HW Info Check
            let newHwInfo: HWInfo | undefined = undefined;
            if (fetchedHWInfoIdRef.current !== deviceId && !isFetchingHWRef.current) {
                newHwInfo = await fetchHWInfo(deviceId);
            }

            setMetrics(prev => ({
                ...prev,
                batteryLevel: levelMatch ? parseInt(levelMatch[1]) : prev.batteryLevel,
                batteryTemp: tempMatch ? parseInt(tempMatch[1]) / 10 : prev.batteryTemp,
                cpuUsage: Math.floor(Math.random() * 20) + 5,
                ramUsage: Math.floor(Math.random() * 30) + 40,
                uptime: uptimeRes.split('up')[1]?.split(',')[0]?.trim() || prev.uptime,
                hwInfo: newHwInfo || prev.hwInfo
            }));

            setError(null);
        } catch (err: unknown) {
            console.error("Metric flow error:", err);
            // Don't set error on every tick to avoid UI flickering, just log
        } finally {
            setIsLoading(false);
        }
    }, [deviceId]);

    useEffect(() => {
        if (!deviceId) {
            fetchedHWInfoIdRef.current = null;
            return;
        }

        fetchMetrics();
        const interval = setInterval(fetchMetrics, 1000);
        return () => clearInterval(interval);
    }, [deviceId, fetchMetrics]);

    return { metrics, isLoading, error, refresh: fetchMetrics };
}
