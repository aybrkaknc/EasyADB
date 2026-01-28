import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BackupFile } from "../types/adb";

// Re-export for backward compatibility
export type { BackupFile };

/**
 * Yedek dosyalarını listeleyen hook.
 * 
 * @param refreshTrigger - Yenileme tetikleyicisi
 * @param customPath - Özel yedekleme klasörü yolu (opsiyonel)
 */
export function useBackups(refreshTrigger: number, customPath?: string) {
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchBackups = async () => {
            setLoading(true);
            try {
                // customPath'i backend'e gönder (null ise Downloads kullanılır)
                const list = await invoke<BackupFile[]>("list_backups", {
                    customPath: customPath || null
                });
                setBackups(list);
                setError(null);
            } catch (err: unknown) {
                console.error("Failed to list backups:", err);
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        };

        fetchBackups();
    }, [refreshTrigger, customPath]); // customPath dependency eklendi

    return { backups, loading, error };
}

