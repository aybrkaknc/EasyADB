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
 * Paketin sistem uygulaması olup olmadığını güvenli şekilde kontrol eder.
 * undefined durumunda false döner (user app olarak kabul edilir).
 * 
 * @param pkg - Kontrol edilecek paket
 * @returns true ise sistem uygulaması, false ise kullanıcı uygulaması
 */
export function isSystemPackage(pkg: PackageInfo): boolean {
    return pkg.is_system === true;
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
