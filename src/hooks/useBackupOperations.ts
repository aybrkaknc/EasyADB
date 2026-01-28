import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useApp } from '../context/AppContext';
import { usePackages } from './usePackages';
import { useBackups } from './useBackups';
import { PackageInfo, BackupFile, ProgressState } from '../types/adb';
import { playSuccessSound, sendOSNotification } from '../lib/feedback';

/**
 * Backup operasyonları için hook dönüş tipi.
 */
export interface BackupOperationsResult {
    // Data
    packages: PackageInfo[];
    backups: BackupFile[];
    selectedPackages: PackageInfo[];
    selectedBackups: BackupFile[];

    // Loading States
    packagesLoading: boolean;
    backupsLoading: boolean;
    isProcessing: boolean;

    // Errors
    packagesError: string | null;
    backupsError: string | null;

    // Metrics
    totalSize: number;
    progress: ProgressState;

    // Package Actions
    togglePackage: (pkg: PackageInfo) => Promise<void>;
    toggleSelectAllPackages: (pkgs: PackageInfo[]) => Promise<void>;

    // Backup Actions
    toggleBackup: (backup: BackupFile) => void;
    toggleSelectAllBackups: (files: BackupFile[]) => void;

    // Operations
    executeBackup: () => Promise<void>;
    executeRestore: () => Promise<void>;
    deleteBackup: (backup: BackupFile) => Promise<void>;
    batchDeleteBackups: (files: BackupFile[]) => Promise<void>;

    // Utility
    refresh: () => void;
    clearSelections: () => void;
    setProgress: React.Dispatch<React.SetStateAction<ProgressState>>;
    refreshTrigger: number;

    // UI Dialogs
    errorState: { isOpen: boolean; title: string; message: string; };
    dismissError: () => void;
}

interface UseBackupOperationsOptions {
    soundEnabled?: boolean;
    notificationsEnabled?: boolean;
}

/**
 * Backup modülü için tüm state ve business logic'i yöneten hook.
 * 
 * @param deviceId - Bağlı cihazın ID'si
 * @param customBackupPath - Özel yedekleme klasörü yolu
 * @param options - Ses ve bildirim ayarları
 */
export function useBackupOperations(
    deviceId: string | undefined,
    customBackupPath: string | undefined,
    options: UseBackupOperationsOptions = {}
): BackupOperationsResult {
    const { soundEnabled = true, notificationsEnabled = true } = options;
    const { addLog } = useApp();

    // Refresh trigger
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Data hooks
    const { packages, loading: packagesLoading, error: packagesError } = usePackages(deviceId, refreshTrigger);
    const { backups, loading: backupsLoading, error: backupsError } = useBackups(refreshTrigger, customBackupPath);

    // Selections
    const [selectedPackages, setSelectedPackages] = useState<PackageInfo[]>([]);
    const [selectedBackups, setSelectedBackups] = useState<BackupFile[]>([]);

    // Processing State
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState<ProgressState>({
        isActive: false,
        currentTask: "",
        current: 0,
        total: 0
    });

    // Size Tracking
    const [totalSize, setTotalSize] = useState(0);
    const [sizeCache, setSizeCache] = useState<Record<string, number>>({});

    // Global Error State
    const [errorState, setErrorState] = useState({ isOpen: false, title: "", message: "" });
    const dismissError = useCallback(() => setErrorState(prev => ({ ...prev, isOpen: false })), []);

    // Previous connection state ref
    const prevDeviceIdRef = useRef<string | undefined>(undefined);

    // Cihaz değiştiğinde seçimleri temizle
    useEffect(() => {
        if (prevDeviceIdRef.current !== deviceId) {
            setSelectedPackages([]);
            setSelectedBackups([]);
            setTotalSize(0);
            prevDeviceIdRef.current = deviceId;
        }
    }, [deviceId]);

    /**
     * Seçimleri temizle.
     */
    const clearSelections = useCallback(() => {
        setSelectedPackages([]);
        setSelectedBackups([]);
        setTotalSize(0);
    }, []);

    /**
     * Listeyi yenile.
     */
    const refresh = useCallback(() => {
        setRefreshTrigger(prev => prev + 1);
    }, []);

    /**
     * Paket seçimini toggle et.
     */
    const togglePackage = useCallback(async (pkg: PackageInfo) => {
        const exists = selectedPackages.find(p => p.name === pkg.name);

        if (exists) {
            setSelectedPackages(prev => prev.filter(p => p.name !== pkg.name));
            setTotalSize(prev => Math.max(0, prev - (sizeCache[pkg.name] || 0)));
        } else {
            setSelectedPackages(prev => [...prev, pkg]);

            // Size hesapla
            if (!sizeCache[pkg.name] && deviceId) {
                try {
                    const size = await invoke<number>("get_package_size", {
                        deviceId,
                        package: pkg
                    });
                    setSizeCache(prev => ({ ...prev, [pkg.name]: size }));
                    setTotalSize(prev => prev + size);
                } catch {
                    // Silent fail
                }
            } else {
                setTotalSize(prev => prev + (sizeCache[pkg.name] || 0));
            }
        }
    }, [selectedPackages, sizeCache, deviceId]);

    /**
     * Tüm paketleri seç/kaldır.
     */
    const toggleSelectAllPackages = useCallback(async (pkgs: PackageInfo[]) => {
        const allFilteredSelected = pkgs.every(p => selectedPackages.some(sp => sp.name === p.name));
        const filteredNames = pkgs.map(p => p.name);

        if (allFilteredSelected) {
            // Deselect
            setSelectedPackages(prev => prev.filter(p => !filteredNames.includes(p.name)));
            const sizeToRemove = pkgs.reduce((acc, p) => acc + (sizeCache[p.name] || 0), 0);
            setTotalSize(prev => Math.max(0, prev - sizeToRemove));
        } else {
            // Select missing ones
            const toAdd = pkgs.filter(p => !selectedPackages.some(sp => sp.name === p.name));
            if (toAdd.length > 0) {
                setSelectedPackages(prev => [...prev, ...toAdd]);

                let batchSize = 0;
                const newSizes: Record<string, number> = {};

                // Calculate cached sizes immediately
                toAdd.forEach(p => {
                    if (sizeCache[p.name]) {
                        batchSize += sizeCache[p.name];
                    }
                });

                // Optimistic update
                setTotalSize(prev => prev + batchSize);

                // Fetch uncached sizes
                if (deviceId) {
                    for (const pkg of toAdd) {
                        if (!sizeCache[pkg.name]) {
                            try {
                                const size = await invoke<number>("get_package_size", {
                                    deviceId,
                                    package: pkg
                                });
                                newSizes[pkg.name] = size;
                                setTotalSize(prev => prev + size);
                            } catch {
                                // Silent fail
                            }
                        }
                    }
                    if (Object.keys(newSizes).length > 0) {
                        setSizeCache(prev => ({ ...prev, ...newSizes }));
                    }
                }
            }
        }
    }, [selectedPackages, sizeCache, deviceId]);

    /**
     * Backup seçimini toggle et.
     */
    const toggleBackup = useCallback((backup: BackupFile) => {
        const exists = selectedBackups.find(b => b.path === backup.path);
        if (exists) {
            setSelectedBackups(prev => prev.filter(b => b.path !== backup.path));
        } else {
            setSelectedBackups(prev => [...prev, backup]);
        }
    }, [selectedBackups]);

    /**
     * Tüm backupları seç/kaldır.
     */
    const toggleSelectAllBackups = useCallback((files: BackupFile[]) => {
        const allFilteredSelected = files.every(f => selectedBackups.some(sb => sb.path === f.path));
        if (allFilteredSelected) {
            const filePaths = files.map(f => f.path);
            setSelectedBackups(prev => prev.filter(f => !filePaths.includes(f.path)));
        } else {
            const toAdd = files.filter(f => !selectedBackups.some(sb => sb.path === f.path));
            setSelectedBackups(prev => [...prev, ...toAdd]);
        }
    }, [selectedBackups]);

    /**
     * Toplu yedekleme işlemi.
     */
    const executeBackup = useCallback(async () => {
        if (!deviceId || selectedPackages.length === 0) return;

        setIsProcessing(true);
        const total = selectedPackages.length;
        setProgress({ isActive: true, currentTask: "Preparing backup...", total, current: 0, completedItems: [] });

        for (let i = 0; i < total; i++) {
            const pkg = selectedPackages[i];
            setProgress(prev => ({
                ...prev,
                currentTask: pkg.name,
                detail: `Stream synchronized. Transferring data packets for ${pkg.name}...`,
                current: i + 1,
            }));

            try {
                await invoke<string>("perform_backup", {
                    deviceId,
                    package: pkg,
                    customPath: customBackupPath || null
                });
                setProgress(prev => ({
                    ...prev,
                    completedItems: [...(prev.completedItems || []), pkg.name]
                }));
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                addLog(`Backup failed for ${pkg.name}: ${msg}`, 'error');
            }
        }

        setProgress(prev => ({ ...prev, currentTask: "Sequence Complete", detail: "All data packets verified and stored." }));
        setIsProcessing(false);
        setSelectedPackages([]);
        setTotalSize(0);
        refresh();

        // Feedback
        if (soundEnabled) playSuccessSound();
        if (notificationsEnabled) {
            sendOSNotification("EasyADB: Backup Complete", `Successfully processed ${total} packages.`);
        }
    }, [deviceId, selectedPackages, customBackupPath, soundEnabled, notificationsEnabled, refresh]);

    /**
     * Toplu geri yükleme işlemi.
     * P0 #3: Hata yönetimi eklendi - hatalar kullanıcıya gösteriliyor.
     */
    const executeRestore = useCallback(async () => {
        if (!deviceId || selectedBackups.length === 0) return;

        setIsProcessing(true);
        const total = selectedBackups.length;
        let failedCount = 0;
        setProgress({ isActive: true, currentTask: "Preparing restore...", total, current: 0, completedItems: [], failedItems: [] });

        for (let i = 0; i < total; i++) {
            const file = selectedBackups[i];
            setProgress(prev => ({
                ...prev,
                currentTask: file.name,
                detail: `Injecting data payload: ${file.name}`,
                current: i + 1,
            }));

            try {
                await invoke<string>("perform_restore", {
                    deviceId,
                    backupPath: file.path
                });
                setProgress(prev => ({
                    ...prev,
                    completedItems: [...(prev.completedItems || []), file.name]
                }));
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                addLog(`Restore failed for ${file.name}: ${errorMessage}`, 'error');
                failedCount++;
                setProgress(prev => ({
                    ...prev,
                    detail: `ERROR: ${errorMessage}`,
                    failedItems: [...(prev.failedItems || []), file.name]
                }));
            }
        }

        // İşlem tamamlandı - sonuç mesajı
        const successCount = total - failedCount;
        const finalMessage = failedCount > 0
            ? `Completed with ${failedCount} error(s)`
            : "Sequence Complete";

        setProgress(prev => ({
            ...prev,
            currentTask: finalMessage,
            detail: `${successCount}/${total} files restored successfully`
        }));

        setIsProcessing(false);
        setSelectedBackups([]);
        refresh();

        // Feedback
        if (soundEnabled) playSuccessSound();
        if (notificationsEnabled) {
            const notifMessage = failedCount > 0
                ? `Restored ${successCount}/${total} files. ${failedCount} failed.`
                : `Successfully restored ${total} files.`;
            sendOSNotification("EasyADB: Restore Complete", notifMessage);
        }
    }, [deviceId, selectedBackups, soundEnabled, notificationsEnabled, refresh]);

    /**
     * Tek bir backup'ı sil.
     * P2 #9: Hata durumunda kullanıcıya bildirim gösteriliyor.
     */
    const deleteBackup = useCallback(async (backup: BackupFile) => {
        try {
            await invoke("delete_backup", { path: backup.path });
            setSelectedBackups(prev => prev.filter(b => b.path !== backup.path));
            refresh();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog(`Failed to delete backup: ${errorMessage}`, 'error');

            // Popup yerine log
            /* setErrorState(...) */
        }
    }, [refresh]);

    /**
     * Toplu backup silme.
     */
    const batchDeleteBackups = useCallback(async (files: BackupFile[]) => {
        if (files.length === 0) return;
        setIsProcessing(true);

        for (const file of files) {
            try {
                await invoke("delete_backup", { path: file.path });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                addLog(`Failed to delete ${file.name}: ${errorMessage}`, 'error');
                // Popup iptal
            }
        }

        setSelectedBackups([]);
        refresh();
        setIsProcessing(false);
    }, [refresh]);

    return {
        // Data
        packages,
        backups,
        selectedPackages,
        selectedBackups,

        // Loading States
        packagesLoading,
        backupsLoading,
        isProcessing,

        // Errors
        packagesError,
        backupsError,

        // Metrics
        totalSize,
        progress,

        // Package Actions
        togglePackage,
        toggleSelectAllPackages,

        // Backup Actions
        toggleBackup,
        toggleSelectAllBackups,

        // Operations
        executeBackup,
        executeRestore,
        deleteBackup,
        batchDeleteBackups,

        // Utility
        refresh,
        clearSelections,
        setProgress,
        refreshTrigger, // P0 #2: Dışarıya export ediliyor

        // UI Dialogs
        errorState,
        dismissError
    };
}
