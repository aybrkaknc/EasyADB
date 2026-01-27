import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PackageInfo } from '../types/adb';

// Re-export for backward compatibility
export type AppPackage = PackageInfo;

// Backend cache response tipi
interface CachedPackage {
    name: string;
    path: string;
    is_system: boolean;
    is_disabled: boolean;
    is_uninstalled: boolean;
    label: string | null;
}

/**
 * Paket listesi hook'u - Cache-First yaklaşım.
 * 
 * 1. Önce cache'ten yükler (anında görüntüleme)
 * 2. Arka planda cihazla senkronize eder
 * 3. Değişiklik varsa UI'ı günceller
 */
export function usePackages(deviceId?: string, refreshTrigger: number = 0) {
    const [packages, setPackages] = useState<PackageInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;

        if (!deviceId) {
            setPackages([]);
            return;
        }

        const loadPackages = async () => {
            setLoading(true);
            setError(null);

            try {
                // 1. Cache'ten yükle (anında)
                const cached = await invoke<CachedPackage[] | null>('get_cached_packages', { deviceId });

                if (cached && cached.length > 0 && isMountedRef.current) {
                    // Cache'ten gelen veriyi PackageInfo formatına dönüştür
                    setPackages(cached.map(p => ({
                        name: p.name,
                        path: p.path,
                        is_system: p.is_system,
                        label: p.label || p.name.split('.').pop()?.replace(/^\w/, c => c.toUpperCase()) || p.name
                    })));
                    setLoading(false);
                }

                // 2. Arka planda senkronize et
                if (isMountedRef.current) {
                    setSyncing(true);
                }

                const freshPackages = await invoke<CachedPackage[]>('sync_backup_packages', { deviceId });

                if (isMountedRef.current) {
                    // Güncel listeyi set et
                    setPackages(freshPackages.map(p => ({
                        name: p.name,
                        path: p.path,
                        is_system: p.is_system,
                        label: p.label || p.name.split('.').pop()?.replace(/^\w/, c => c.toUpperCase()) || p.name
                    })));
                    setLoading(false);
                    setSyncing(false);

                    // 3. Label'ları arka planda çöz (Progressive Enhancement)
                    resolveLabelsInBackground(freshPackages.map(p => p.name));
                }

            } catch (err: unknown) {
                if (isMountedRef.current) {
                    console.error("Failed to load packages:", err);
                    setError(err instanceof Error ? err.message : String(err));
                    setLoading(false);
                    setSyncing(false);
                }
            }
        };

        /**
         * Label'ları arka planda çöz ve UI'ı güncelle.
         */
        const resolveLabelsInBackground = async (packageNames: string[]) => {
            const BATCH_SIZE = 10;

            for (let i = 0; i < packageNames.length; i += BATCH_SIZE) {
                if (!isMountedRef.current) break;

                const batch = packageNames.slice(i, i + BATCH_SIZE);
                const updates = await Promise.all(batch.map(async (name) => {
                    try {
                        const label = await invoke<string | null>('resolve_package_label', { packageName: name });
                        return { name, label };
                    } catch {
                        return { name, label: null };
                    }
                }));

                if (isMountedRef.current) {
                    setPackages(prev => {
                        const next = [...prev];
                        updates.forEach(u => {
                            if (u.label) {
                                const index = next.findIndex(p => p.name === u.name);
                                if (index !== -1) {
                                    next[index] = { ...next[index], label: u.label };
                                }
                            }
                        });
                        return next;
                    });
                }
            }
        };

        loadPackages();

        return () => { isMountedRef.current = false; };
    }, [deviceId, refreshTrigger]);

    return { packages, loading, syncing, error };
}
