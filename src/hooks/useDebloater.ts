import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DebloaterPackage } from '../types/adb';

/**
 * Debloater filtre tipleri.
 */
export type DebloaterFilter = 'all' | 'system' | 'user' | 'disabled' | 'uninstalled';

/**
 * Debloater modülü için state yönetimi hook'u.
 * Paket listesi, filtreleme, toplu seçim ve aksiyonları yönetir.
 */
export function useDebloater(deviceId: string | undefined) {
    const [packages, setPackages] = useState<DebloaterPackage[]>([]);
    const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<DebloaterFilter>('user');
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showSystemWarning, setShowSystemWarning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Paket listesini backend'den çeker.
     */
    const fetchPackages = useCallback(async () => {
        if (!deviceId) {
            setPackages([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const result = await invoke<DebloaterPackage[]>('list_all_packages', { deviceId });
            setPackages(result);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    }, [deviceId]);

    // Cihaz değiştiğinde paketleri yenile
    useEffect(() => {
        if (deviceId) {
            fetchPackages();
        } else {
            setPackages([]);
            setSelectedPackages(new Set());
        }
    }, [deviceId, fetchPackages]);

    /**
     * Filtrelenmiş paket listesi.
     */
    const filteredPackages = packages.filter(pkg => {
        // Arama filtresi
        if (search && !pkg.name.toLowerCase().includes(search.toLowerCase())) {
            return false;
        }

        // Kategori filtresi
        switch (filter) {
            case 'system':
                return pkg.is_system && !pkg.is_uninstalled;
            case 'user':
                return !pkg.is_system && !pkg.is_uninstalled;
            case 'disabled':
                return pkg.is_disabled && !pkg.is_uninstalled;
            case 'uninstalled':
                return pkg.is_uninstalled;
            default:
                return true;
        }
    });

    /**
     * Paket seçimini değiştirir.
     */
    const togglePackage = useCallback((packageName: string) => {
        setSelectedPackages(prev => {
            const next = new Set(prev);
            if (next.has(packageName)) {
                next.delete(packageName);
            } else {
                next.add(packageName);
            }
            return next;
        });
    }, []);

    /**
     * Tümünü seç/bırak.
     */
    const toggleSelectAll = useCallback(() => {
        if (selectedPackages.size === filteredPackages.length) {
            setSelectedPackages(new Set());
        } else {
            setSelectedPackages(new Set(filteredPackages.map(p => p.name)));
        }
    }, [filteredPackages, selectedPackages.size]);

    /**
     * Toplu işlemi yürütür.
     */
    const performBatchAction = useCallback(async (backendCommand: string) => {
        if (!deviceId || selectedPackages.size === 0) return;

        setIsProcessing(true);
        setError(null);
        try {
            for (const pkgName of selectedPackages) {
                await invoke(backendCommand, { deviceId, packageName: pkgName });
            }
            await fetchPackages();
            setSelectedPackages(new Set());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [deviceId, selectedPackages, fetchPackages]);

    const disableSelected = () => performBatchAction('disable_pkg');
    const enableSelected = () => performBatchAction('enable_pkg');
    const uninstallSelected = () => performBatchAction('uninstall_pkg');
    const reinstallSelected = () => performBatchAction('reinstall_pkg');


    /**
     * Filtre değiştiğinde sistem uyarısı göster.
     */
    const handleFilterChange = useCallback((newFilter: DebloaterFilter) => {
        if ((newFilter === 'system' || newFilter === 'all') && !showSystemWarning) {
            setShowSystemWarning(true);
        }
        setFilter(newFilter);
        setSelectedPackages(new Set());
    }, [showSystemWarning]);

    return {
        packages: filteredPackages,
        allPackagesCount: packages.length,
        selectedPackages,
        filter,
        search,
        isLoading,
        isProcessing,
        showSystemWarning,
        error,
        setSearch,
        setFilter: handleFilterChange,
        togglePackage,
        toggleSelectAll,
        disableSelected,
        enableSelected,
        uninstallSelected,
        reinstallSelected,
        refresh: fetchPackages,
        dismissSystemWarning: () => setShowSystemWarning(false),
    };
}
