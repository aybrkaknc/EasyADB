import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DebloaterPackage } from '../types/adb';
import { playSuccessSound, sendOSNotification } from '../lib/feedback';
import { useApp } from '../context/AppContext';

/**
 * Debloater filtre tipleri.
 */
export type DebloaterFilter = 'all' | 'system' | 'user' | 'disabled' | 'uninstalled';

// Backend cache response tipi
interface CachedPackage {
    name: string;
    path: string;
    is_system: boolean;
    is_disabled: boolean;
    is_uninstalled: boolean;
    label: string | null;
}

interface SyncResult {
    added: string[];
    removed: string[];
    changed: string[];
    total: number;
}

/**
 * Debloater modülü için state yönetimi hook'u - Cache-First yaklaşım.
 * Paket listesi, filtreleme, toplu seçim ve aksiyonları yönetir.
 * 
 * 1. Önce cache'ten yükler (anında görüntüleme)
 * 2. Arka planda cihazla senkronize eder
 * 3. Değişiklik varsa UI'ı günceller
 */
export function useDebloater(deviceId: string | undefined, refreshTrigger: number = 0) {
    const { settings, addLog } = useApp();
    const [packages, setPackages] = useState<DebloaterPackage[]>([]);
    const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<DebloaterFilter>('user');
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showSystemWarning, setShowSystemWarning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Global Error State (AlertDialog için)
    const [errorState, setErrorState] = useState({ isOpen: false, title: "", message: "" });
    const dismissError = useCallback(() => setErrorState(prev => ({ ...prev, isOpen: false })), []);

    // Global Confirm State (AlertDialog için)
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        variant: 'error' | 'warning' | 'info';
        onConfirm?: () => void;
    }>({ isOpen: false, title: "", message: "", variant: 'warning' });

    const dismissConfirm = useCallback(() => setConfirmState(prev => ({ ...prev, isOpen: false })), []);

    const isMountedRef = useRef(true);

    /**
     * Cache'ten yükle, sonra arka planda senkronize et.
     */
    const fetchPackages = useCallback(async () => {
        if (!deviceId) {
            setPackages([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 1. Cache'ten yükle (anında)
            const cached = await invoke<CachedPackage[] | null>('get_cached_packages', { deviceId });

            if (cached && cached.length > 0 && isMountedRef.current) {
                // Cache'ten gelen veriyi DebloaterPackage formatına dönüştür
                setPackages(cached.map(p => ({
                    name: p.name,
                    is_system: p.is_system,
                    is_disabled: p.is_disabled,
                    is_uninstalled: p.is_uninstalled,
                    label: p.label || p.name.split('.').pop()?.replace(/^\w/, c => c.toUpperCase()) || p.name
                })));
                setIsLoading(false);
            }

            // 2. Arka planda senkronize et
            if (isMountedRef.current) {
                setIsSyncing(true);
            }

            const syncResult = await invoke<SyncResult>('sync_device_packages', { deviceId });

            // 3. Güncel listeyi çek
            const freshCached = await invoke<CachedPackage[] | null>('get_cached_packages', { deviceId });

            if (freshCached && isMountedRef.current) {
                setPackages(freshCached.map(p => ({
                    name: p.name,
                    is_system: p.is_system,
                    is_disabled: p.is_disabled,
                    is_uninstalled: p.is_uninstalled,
                    label: p.label || p.name.split('.').pop()?.replace(/^\w/, c => c.toUpperCase()) || p.name
                })));

                // Sync sonucunu logla (opsiyonel)
                if (syncResult.added.length > 0 || syncResult.removed.length > 0) {
                    console.log(`[DeviceCache] Sync complete: +${syncResult.added.length} -${syncResult.removed.length}`);
                }
            }

            if (isMountedRef.current) {
                setIsLoading(false);
                setIsSyncing(false);

                // 4. Label'ları arka planda çöz
                if (freshCached) {
                    resolveLabelsInBackground(freshCached.map(p => p.name));
                }
            }

        } catch (err: unknown) {
            if (isMountedRef.current) {
                setError(err instanceof Error ? err.message : String(err));
                setIsLoading(false);
                setIsSyncing(false);
            }
        }
    }, [deviceId]);

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

    // Cihaz değiştiğinde paketleri yenile
    useEffect(() => {
        isMountedRef.current = true;

        if (deviceId) {
            fetchPackages();
        } else {
            setPackages([]);
            setSelectedPackages(new Set());
        }

        return () => { isMountedRef.current = false; };
    }, [deviceId, fetchPackages, refreshTrigger]);

    /**
     * Filtrelenmiş paket listesi.
     */
    const filteredPackages = useMemo(() => {
        return packages.filter(pkg => {
            // Arama filtresi (name ve label'da ara)
            if (search) {
                const searchLower = search.toLowerCase();
                const matchesName = pkg.name.toLowerCase().includes(searchLower);
                const matchesLabel = pkg.label?.toLowerCase().includes(searchLower);
                if (!matchesName && !matchesLabel) {
                    return false;
                }
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
    }, [packages, search, filter]);

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
        const allSelected = filteredPackages.length > 0 && filteredPackages.every(p => selectedPackages.has(p.name));

        setSelectedPackages(prev => {
            const next = new Set(prev);

            if (allSelected) {
                // Seçimi kaldır (Sadece filtredekileri)
                filteredPackages.forEach(p => next.delete(p.name));
            } else {
                // Seç (Hepsini, diğerlerini koruyarak)
                filteredPackages.forEach(p => next.add(p.name));
            }
            return next;
        });
    }, [filteredPackages, selectedPackages]);

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

            // Feedback
            if (settings.soundEnabled) playSuccessSound();
            if (settings.notificationsEnabled) {
                sendOSNotification("EasyADB: Action Complete", `Successfully executed ${backendCommand} on ${selectedPackages.size} packages.`);
            }

            setSelectedPackages(new Set());
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);

            // Global Log
            addLog(`Action Failed: ${errorMessage}`, 'error');
            setError(null);

            // Eski logic temizlendi

            // Popup (Alert Dialog) iptal edildi - Kullanıcı isteği
            // setErrorState(...)
        } finally {
            setIsProcessing(false);
        }
    }, [deviceId, selectedPackages, fetchPackages, settings, addLog]);

    /**
     * Güvenli işlem isteği. Sistem paketi varsa uyarır.
     */
    const requestConfirmation = useCallback((actionName: string, backendCommand: string) => {
        if (selectedPackages.size === 0) return;

        // Sistem paketi kontrolü
        let hasSystemPackage = false;
        const selectedList = Array.from(selectedPackages);

        // Mevcut paket listesinden sistem paketlerini bul
        for (const pkgName of selectedList) {
            const pkg = packages.find(p => p.name === pkgName);
            if (pkg?.is_system) {
                hasSystemPackage = true;
                break;
            }
        }

        const isSystemCritical = hasSystemPackage && (actionName === 'UNINSTALL' || actionName === 'DISABLE');

        setConfirmState({
            isOpen: true,
            title: isSystemCritical ? `SYSTEM SAFETY WARNING: ${actionName}` : `CONFIRM ${actionName}`,
            message: isSystemCritical
                ? `WARNING: You are about to ${actionName.toLowerCase()} ${selectedPackages.size} package(s), including SYSTEM packages. This may cause bootloops or device instability. Proceed with caution.`
                : `Are you sure you want to ${actionName.toLowerCase()} ${selectedPackages.size} package(s)?`,
            variant: isSystemCritical ? 'error' : 'warning',
            onConfirm: () => {
                setConfirmState(prev => ({ ...prev, isOpen: false }));
                performBatchAction(backendCommand);
            }
        });
    }, [packages, selectedPackages, performBatchAction]);

    const disableSelected = () => requestConfirmation('DISABLE', 'disable_pkg');
    const enableSelected = () => requestConfirmation('ENABLE', 'enable_pkg');
    const uninstallSelected = () => requestConfirmation('UNINSTALL', 'uninstall_pkg');
    const reinstallSelected = () => requestConfirmation('REINSTALL', 'reinstall_pkg');

    /**
     * Filtre değiştiğinde seçimleri sıfırla.
     */
    const handleFilterChange = useCallback((newFilter: DebloaterFilter) => {
        setFilter(newFilter);
        setSelectedPackages(new Set());
    }, []);

    return {
        packages: filteredPackages,
        allPackagesCount: packages.length,
        selectedPackages,
        filter,
        search,
        isLoading,
        isSyncing,
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

        // Error Dialog
        errorState,
        dismissError,

        // Confirm Dialog
        confirmState,
        dismissConfirm
    };
}
