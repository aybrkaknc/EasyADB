export interface SmartError {
    raw: string;
    title: string;
    description: string;
    actionLabel?: string;
    actionCommand?: string;
    severity: 'warning' | 'error' | 'critical';
}

const ERROR_DB: Record<string, Omit<SmartError, 'raw'>> = {
    "unauthorized": {
        title: "CİHAZ YETKİSİ YOK",
        description: "Telefonunuzdaki RSA anahtarını (Hata Ayıklama İzni) onaylamanız gerekiyor. 'Bu bilgisayara her zaman izin ver' seçeneğini işaretleyip 'Tamam' deyin.",
        severity: "warning"
    },
    "no devices/emulators found": {
        title: "CİHAZ BULUNAMADI",
        description: "Bilgisayara bağlı bir cihaz tespit edilemedi. USB kablosunu kontrol edin veya Geliştirici Seçenekleri'nden USB Hata Ayıklama'nın açık olduğundan emin olun.",
        actionLabel: "ADB SERVİSİNİ YENİDEN BAŞLAT",
        actionCommand: "adb kill-server && adb start-server",
        severity: "error"
    },
    "device offline": {
        title: "CİHAZ ÇEVRİMDIŞI",
        description: "Cihaz bağlı ama iletişim kurulamıyor. Kabloyu çıkarıp takmak veya ADB'yi yeniden başlatmak sorunu çözebilir.",
        actionLabel: "ADB YENİDEN BAŞLAT",
        actionCommand: "adb kill-server && adb start-server",
        severity: "warning"
    },
    "more than one device": {
        title: "ÇOKLU CİHAZ ÇAKIŞMASI",
        description: "Şu an birden fazla cihaz bağlı. Lütfen sadece tek bir cihaz bırakın veya belirli bir cihaz ID'si seçin.",
        severity: "error"
    },
    "insufficient storage": {
        title: "YETERSİZ DEPOLAMA",
        description: "Cihazın hafızasında işlem yapacak yer kalmadı. Lütfen gereksiz dosyaları silip tekrar deneyin.",
        severity: "error"
    },
    "protocol fault (no status)": {
        title: "İLETİŞİM HATASI",
        description: "USB bağlantısı kararsız. Başka bir USB portu veya kablosu denemeniz önerilir.",
        severity: "critical"
    },
    "Permission denied": {
        title: "ERİŞİM ENGELLENDİ",
        description: "Bu işlem için gerekli izinler yok. ROOT yetkisi gerekebilir veya sistem dosyalarına müdahale edilmeye çalışılıyor olabilir.",
        severity: "error"
    },
    "is read-only": {
        title: "DOSYA SİSTEMİ KORUMALI",
        description: "Dosya yazmaya çalıştığınız dizin sadece okunabilir. Sistemi 'mount -o remount,rw /' ile yazılabilir yapmanız gerekebilir (Root Gerekir).",
        severity: "warning"
    }
};

/**
 * Ham ADB hatasını analiz eder ve görsel iyileştirme için SmartError döner.
 */
export function analyzeError(rawError: string): SmartError | null {
    const errorString = rawError.toLowerCase();

    for (const key in ERROR_DB) {
        if (errorString.includes(key.toLowerCase())) {
            return {
                raw: rawError,
                ...ERROR_DB[key]
            };
        }
    }

    return null;
}
