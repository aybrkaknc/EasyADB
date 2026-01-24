import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DeviceInfo } from '../types/adb';

export function useDeviceStatus() {
    const [devices, setDevices] = useState<DeviceInfo[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    useEffect(() => {
        const checkDevices = async () => {
            try {
                const result = await invoke<DeviceInfo[]>('get_connected_devices');
                setDevices(result);
                setIsConnected(result.length > 0 && result[0].authorized);
                setLastUpdated(new Date());
            } catch (error) {
                console.error("Failed to check devices:", error);
                setIsConnected(false);
            }
        };

        // Check immediately
        checkDevices();

        // Then poll every 3 seconds
        const interval = setInterval(checkDevices, 3000);

        return () => clearInterval(interval);
    }, []);

    return { devices, isConnected, lastUpdated };
}
