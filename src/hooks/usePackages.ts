import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PackageInfo } from '../types/adb';

// Re-export for backward compatibility
export type AppPackage = PackageInfo;

export function usePackages(deviceId?: string, refreshTrigger: number = 0) {
    const [packages, setPackages] = useState<PackageInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!deviceId) {
            setPackages([]);
            return;
        }

        const fetchPackages = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await invoke<AppPackage[]>('list_packages', { deviceId });
                setPackages(result);
            } catch (err: unknown) {
                console.error("Failed to list packages:", err);
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        };

        fetchPackages();
    }, [deviceId, refreshTrigger]);

    return { packages, loading, error };
}
