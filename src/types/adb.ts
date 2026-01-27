export interface DeviceInfo {
    id: string;
    model: string;
    authorized: boolean;
    state: string;
    is_rooted: boolean;
}

/**
 * Uygulama paketi bilgisi.
 */
export interface PackageInfo {
    name: string;
    path: string;
    is_system?: boolean;
    label?: string; // Human readable name (e.g. "Poweramp")
}

/**
 * Yedek dosyası bilgisi.
 */
export interface BackupFile {
    name: string;
    path: string;
    size: number;
    date: string;
}

/**
 * Debloater modülü için paket bilgisi.
 */
export interface DebloaterPackage {
    name: string;
    is_system: boolean;
    is_disabled: boolean;
    is_uninstalled: boolean;
    label?: string; // Human readable name
    description?: string;
    recommendation?: 'safe' | 'recommended' | 'advanced' | 'expert' | 'unsafe' | 'unknown';
}

export interface ProgressState {
    isActive: boolean;
    currentTask: string;
    detail?: string;
    percent?: number;
    current: number;
    total: number;
    isIndeterminate?: boolean;
    completedItems?: string[];
}
