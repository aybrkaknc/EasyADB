import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BackupFile } from "../types/adb";

// Re-export for backward compatibility
export type { BackupFile };

export function useBackups(refreshTrigger: number, _customPath?: string) {
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchBackups = async () => {
            setLoading(true);
            try {
                const list = await invoke<BackupFile[]>("list_backups");
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
    }, [refreshTrigger]);

    return { backups, loading, error };
}
