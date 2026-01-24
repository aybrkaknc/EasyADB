# Mimari & Tasarım (EasyADB)

## 1. ADB Yönetim Stratejisi (Embedded Storage)

Uygulama, "Sidecar" yerine "Resource Embedding" kullanarak tam taşınabilirlik sağlar.

1.  **Gömme (Embedding):** `adb.exe` ve gerekli DLL'ler Rust binary'si içine gömülür.
2.  **Çıkarma (Extraction):** Uygulama başladığında bu binary'ler sistem `%TEMP%` dizinine çıkarılır.
3.  **Yürütme (Execution):** Backend, tüm ADB isteklerini bu geçici yoldaki binary üzerinden yönetir.
4.  **Güvenlik:** ADB server'ın çökmesi durumunda backend otomatik olarak yeniden başlatma dener.

## 2. Yedekleme Formatı (`.easybckp` v3.0)

Standart bir ZIP arşivi olan `.easybckp`, modern Android (Split APK) ve Root (Data) yapılarını destekler.

**Dosya Yapısı (Hybrid Format):**
```
[package_name]_[timestamp].easybckp (ZIP)
├── apks/                  (Uygulama parçaları)
│   ├── base.apk           (Ana modül)
│   └── split_config.xxx.apk
├── obb/                   (Opsiyonel - Büyük oyun verileri)
│   └── main.xxx.obb
├── data.tar.gz            (Opsiyonel - Root ile alınan uygulama verileri)
└── metadata.json          (Paket ismi, tarih, versiyon, isSplit, hasObb, hasData)
```

## 3. Kullanıcı Arayüzü Mimarisi (ADB_UI Design System)

Uygulama, **ADB_UI** adını verdiğimiz özel bir tasarım dili üzerine kuruludur. Detaylı teknik spektrum için `docs/design/ADB_UI_SPEC.md` dosyasına bakılabilir.

*   **Hybrid Typography:** UI etiketleri için `Space Grotesk`, teknik veriler için `JetBrains Mono`.
*   **Aesthetic:** Keskin köşeler, neon parlamalar ve scanline efektli terminal arayüzü.
*   **Sidebar Tabs:** Yedekleme ve Geri Yükleme modları arasında geçiş yapar.
*   **Search & Filter:** Büyük uygulama listelerinde paket ismine göre hızlı arama sağlar.
*   **Log Panel:** Tüm arka plan işlemlerini (ADB komutları, dosya yazımları) gerçek zamanlı olarak kullanıcıya raporlar.
*   **Refresh Mechanism:** Manuel yenileme butonları üzerinden cihaz listesini veya yerel yedekleri tetikler.

## 4. Geri Yükleme Akışı

1.  **Tarama:** Backend, `Downloads` klasörünü periyodik olarak veya istek üzerine `.easybckp` dosyaları için tarar.
2.  **Ayrıştırma:** ZIP içindeki `metadata.json` okunarak frontend'e liste gönderilir.
3.  **Yükleme:** Seçilen yedekler geçici bir klasöre açılır.
4.  **APK Kurulumu:** `adb install` veya `adb install-multiple` (Split APK ise) kullanılır.
5.  **OBB Restore:** Varsa OBB klasörü `/sdcard/Android/obb/` dizinine `push` edilir.
6.  **Data Restore:** Root varsa `data.tar.gz` arşivi `/data/data/` dizinine açılır, `chown` ve `restorecon` ile izinler düzeltilir.
7.  **Temizlik:** İşlem bittiğinde geçici dosyalar sistemden temizlenir.
8.  **Yedek Silme:** İstenmeyen `.easybckp` dosyaları Rust asenkron komutuyla diskten kalıcı olarak silinir.
+
+## 5. Gerçek Zamanlı Sideload Akışı
+
+1.  **Intercept:** Frontend `useTerminal` hook'u üzerinden `sideload` komutunu yakalar.
+2.  **Rust Threading:** Backend'de `spawn_blocking` ile yeni bir thread açılır (UI donmaması için).
+3.  **Progess Parsing:** ADB çıktısı (stdout) anlık okunur ve `(~45%)` gibi ifadeler Regex ile parse edilir.
+4.  **Tauri Events:** Ayrıştırılan yüzde verisi `app.emit` ile frontend'e "sideload-progress" eventi olarak gönderilir.
+5.  **UI Feedback:** Terminalin altında sabit bir progress overlay (neon bar) belirir.
+
+## 6. Debloater İstihbarat Portalı (v1.0)
+
+1.  **Knowledge Base:** UAD-NG listeleri baz alınarak hazırlanan `knowledge_base.json` Rust binary'si içine gömülür (`include_str!`).
+2.  **Indexing:** Paket listesi istenirken paket ID'leri Hashmap üzerinden bilgi bankasıyla eşleştirilir.
+3.  **Risk Scoping:** Paketlere `SAFE`, `RECOMMENDED`, `ADVANCED`, `EXPERT` veya `UNSAFE` etiketleri atanır.
+4.  **UI Tooltip:** Paketlerin altında topluluk açıklamaları gösterilir.
+

