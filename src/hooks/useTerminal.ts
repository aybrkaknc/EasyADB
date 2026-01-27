import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface TerminalLog {
    id: number;
    type: 'command' | 'output' | 'error' | 'info' | 'success' | 'warning';
    content: string;
}

export interface ToolsStatus {
    adb: boolean;
    fastboot: boolean;
}

export function useTerminal(deviceId?: string) {
    const [history, setHistory] = useState<TerminalLog[]>([]);
    const [isExecuting, setIsExecuting] = useState(false);
    const [toolsStatus, setToolsStatus] = useState<ToolsStatus>({ adb: true, fastboot: true });
    const [sideloadProgress, setSideloadProgress] = useState<number | null>(null);

    useEffect(() => {
        checkTools();

        const unlisten = listen<{ percentage: number; message: string }>('sideload-progress', (event) => {
            setSideloadProgress(event.payload.percentage);
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const addLog = (type: TerminalLog['type'], content: string) => {
        setHistory(prev => [...prev, { id: Date.now(), type, content }]);
    };

    const checkTools = async () => {
        try {
            const status = await invoke<ToolsStatus>('check_tools');
            setToolsStatus(status);
            if (!status.adb || !status.fastboot) {
                addLog('warning', 'Platform Tools missing (ADB/Fastboot). Some commands may fail.');
            } else {
                // addLog('info', 'Platform tools check: OK');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const installTools = async () => {
        setIsExecuting(true);
        addLog('info', 'Downloading Platform Tools (this make take a few minutes)...');
        try {
            const res = await invoke<string>('install_tools');
            addLog('success', res);
            checkTools();
        } catch (err: unknown) {
            addLog('error', `Installation Failed: ${err}`);
        } finally {
            setIsExecuting(false);
        }
    };

    const executeCommand = async (cmd: string, isMacro = false) => {
        if (!cmd.trim()) return;

        // Remove 'adb' prefix if typed manually
        let cleanCmd = cmd.trim();
        if (cleanCmd.startsWith('adb ')) {
            cleanCmd = cleanCmd.substring(4).trim();
        }

        // Fastboot commands don't need deviceId check necessarily, but let's warn if strictly adb
        if (!deviceId && !cleanCmd.startsWith('fastboot')) {
            // Allow execution but warn? Or block?
            // If tools check failed, we might want to install tools even without device
            // So we pass. But command will fail if no device.
            // addLog('warning', 'No device connected.');
        }

        if (!isMacro) {
            addLog('command', `> ${cmd}`);
        } else {
            addLog('command', `> [MACRO] ${cleanCmd}`);
        }

        setIsExecuting(true);

        // Special handling for Sideload
        if (cleanCmd.startsWith('sideload ')) {
            const path = cleanCmd.substring(9).trim();
            // Clean path (remove quotes if any)
            const finalPath = path.replace(/^["']|["']$/g, '');

            try {
                setSideloadProgress(0);
                addLog('info', `Starting Real-time Sideload: ${finalPath}`);
                const res = await invoke<string>('perform_sideload', {
                    deviceId,
                    path: finalPath
                });
                addLog('success', res);
            } catch (err: unknown) {
                const msg = typeof err === 'string' ? err : String(err);
                addLog('error', msg);
            } finally {
                setIsExecuting(false);
                setSideloadProgress(null);
            }
            return;
        }

        try {
            const output = await invoke<string>('run_adb_command', {
                deviceId,
                command: cleanCmd
            });

            addLog('output', output || '(No Output)');
        } catch (err: unknown) {
            const msg = typeof err === 'string' ? err : String(err);
            addLog('error', msg);
        } finally {
            setIsExecuting(false);
        }
    };

    const clearHistory = () => {
        setHistory([]);
    };

    return {
        history,
        isExecuting,
        executeCommand,
        clearHistory,
        toolsStatus,
        installTools,
        sideloadProgress
    };
}
