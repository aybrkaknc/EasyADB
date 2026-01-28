import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { PackageInfo, BackupFile, DeviceInfo } from '../types/adb';

/**
 * Uygulama modül tipleri.
 * Gelecekte yeni modüller buraya eklenir.
 */
export type ModuleType = 'backup' | 'restore' | 'terminal' | 'debloater' | 'settings' | 'performance';

/**
 * Uygulama geneli state yapısı.
 */
interface AppState {
    // Navigasyon
    activeModule: ModuleType;

    // Cihaz durumu
    devices: DeviceInfo[];
    isConnected: boolean;

    // Backup modülü
    backup: {
        packages: PackageInfo[];
        selectedPackages: PackageInfo[];
        search: string;
    };

    // Restore modülü
    restore: {
        backups: BackupFile[];
        selectedBackups: BackupFile[];
    };

    // Log sistemi
    logs: Array<{ id: number; message: string; type: 'info' | 'success' | 'warning' | 'error'; timestamp: string }>;

    // İşlem durumu
    isProcessing: boolean;

    // Ayarlar
    settings: {
        notificationsEnabled: boolean;
        soundEnabled: boolean;
        backupPath: string | null; // null = default Downloads
    };
}

/**
 * Context action tipleri.
 */
interface AppContextActions {
    setActiveModule: (module: ModuleType) => void;
    setDevices: (devices: DeviceInfo[]) => void;
    setPackages: (packages: PackageInfo[]) => void;
    togglePackage: (pkg: PackageInfo) => void;
    setBackupSearch: (search: string) => void;
    setBackups: (backups: BackupFile[]) => void;
    toggleBackup: (backup: BackupFile) => void;
    addLog: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
    clearLogs: () => void;
    setIsProcessing: (processing: boolean) => void;
    clearSelectedPackages: () => void;
    clearSelectedBackups: () => void;
    updateSettings: (settings: Partial<AppState['settings']>) => void;
}

type AppContextType = AppState & AppContextActions;

const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * AppProvider: Uygulama geneli state yönetimi.
 */
export function AppProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AppState>({
        activeModule: 'backup',
        devices: [],
        isConnected: false,
        backup: {
            packages: [],
            selectedPackages: [],
            search: '',
        },
        restore: {
            backups: [],
            selectedBackups: [],
        },
        logs: [],
        isProcessing: false,
        settings: {
            notificationsEnabled: true,
            soundEnabled: true,
            backupPath: null, // Will be loaded from localStorage
        },
    });

    // Load settings from localStorage on mount
    useEffect(() => {
        const savedSettings = localStorage.getItem('easyAdbSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                setState(prev => ({
                    ...prev,
                    settings: { ...prev.settings, ...parsed },
                }));
            } catch (e) {
                console.error('Failed to parse saved settings:', e);
            }
        }
    }, []);

    // Save settings to localStorage when they change
    useEffect(() => {
        localStorage.setItem('easyAdbSettings', JSON.stringify(state.settings));
    }, [state.settings]);

    // Navigasyon
    const setActiveModule = useCallback((module: ModuleType) => {
        setState(prev => ({ ...prev, activeModule: module }));
    }, []);

    // Cihaz yönetimi
    const setDevices = useCallback((devices: DeviceInfo[]) => {
        setState(prev => ({
            ...prev,
            devices,
            isConnected: devices.length > 0,
        }));
    }, []);

    // Backup modülü
    const setPackages = useCallback((packages: PackageInfo[]) => {
        setState(prev => ({
            ...prev,
            backup: { ...prev.backup, packages },
        }));
    }, []);

    const togglePackage = useCallback((pkg: PackageInfo) => {
        setState(prev => {
            const exists = prev.backup.selectedPackages.find(p => p.name === pkg.name);
            const newSelected = exists
                ? prev.backup.selectedPackages.filter(p => p.name !== pkg.name)
                : [...prev.backup.selectedPackages, pkg];
            return {
                ...prev,
                backup: { ...prev.backup, selectedPackages: newSelected },
            };
        });
    }, []);

    const setBackupSearch = useCallback((search: string) => {
        setState(prev => ({
            ...prev,
            backup: { ...prev.backup, search },
        }));
    }, []);

    const clearSelectedPackages = useCallback(() => {
        setState(prev => ({
            ...prev,
            backup: { ...prev.backup, selectedPackages: [] },
        }));
    }, []);

    // Restore modülü
    const setBackups = useCallback((backups: BackupFile[]) => {
        setState(prev => ({
            ...prev,
            restore: { ...prev.restore, backups },
        }));
    }, []);

    const toggleBackup = useCallback((backup: BackupFile) => {
        setState(prev => {
            const exists = prev.restore.selectedBackups.find(b => b.path === backup.path);
            const newSelected = exists
                ? prev.restore.selectedBackups.filter(b => b.path !== backup.path)
                : [...prev.restore.selectedBackups, backup];
            return {
                ...prev,
                restore: { ...prev.restore, selectedBackups: newSelected },
            };
        });
    }, []);

    const clearSelectedBackups = useCallback(() => {
        setState(prev => ({
            ...prev,
            restore: { ...prev.restore, selectedBackups: [] },
        }));
    }, []);

    // Log sistemi
    const addLog = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error') => {
        setState(prev => ({
            ...prev,
            logs: [...prev.logs, { id: Date.now(), message, type, timestamp: new Date().toLocaleTimeString() }],
        }));
    }, []);

    const clearLogs = useCallback(() => {
        setState(prev => ({ ...prev, logs: [] }));
    }, []);

    // İşlem durumu
    const setIsProcessing = useCallback((processing: boolean) => {
        setState(prev => ({ ...prev, isProcessing: processing }));
    }, []);

    // Ayarlar
    const updateSettings = useCallback((newSettings: Partial<AppState['settings']>) => {
        setState(prev => ({
            ...prev,
            settings: { ...prev.settings, ...newSettings },
        }));
    }, []);

    const value: AppContextType = {
        ...state,
        setActiveModule,
        setDevices,
        setPackages,
        togglePackage,
        setBackupSearch,
        setBackups,
        toggleBackup,
        addLog,
        clearLogs,
        setIsProcessing,
        clearSelectedPackages,
        clearSelectedBackups,
        updateSettings,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/**
 * useApp hook: Context'e erişim sağlar.
 */
export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within AppProvider');
    }
    return context;
}
