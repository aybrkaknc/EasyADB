/**
 * Feedback Utility: İşlem bitişinde ses ve bildirim desteği sağlar.
 */

/**
 * Başarı sesi çalar (Web Audio API kullanarak sentezlenmiş "ping").
 */
export function playSuccessSound() {
    try {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, context.currentTime); // A5 note
        oscillator.frequency.exponentialRampToValueAtTime(440, context.currentTime + 0.3); // Fade down to A4

        gainNode.gain.setValueAtTime(0.1, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.3);

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        oscillator.start();
        oscillator.stop(context.currentTime + 0.3);
    } catch (e) {
        console.error("Failed to play feedback sound:", e);
    }
}

/**
 * OS bildirimi gönderir.
 */
export async function sendOSNotification(title: string, body: string) {
    try {
        // Standard Web Notification API (Tauri adapts this)
        if (!("Notification" in window)) return;

        if (Notification.permission === "granted") {
            new Notification(title, { body, icon: '/icons/128x128.png' });
        } else if (Notification.permission !== "denied") {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                new Notification(title, { body, icon: '/icons/128x128.png' });
            }
        }
    } catch (e) {
        console.error("Failed to send OS notification:", e);
    }
}
