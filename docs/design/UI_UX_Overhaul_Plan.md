# 🛠️ EasyADB: UI/UX Overhaul Uygulama Planı (CORTEX-OVR)

Bu plan, `docs/design/UI_UX_REPORT.md` analizine dayanarak oluşturulmuştur. Amaç, EasyADB'yi %55 (Mevcut) kullanılabilirlik skorundan %82+ hedefine taşımaktır.

---

## 🎯 FAZ 1: Mimari & Temel Taşlar (Icon Rail & Modüler Yapı) [TAMAMLANDI ✅]
**Amaç:** Ölçeklenebilirlik sorununu çözmek ve yeni modüller için zemin hazırlamak.

*   [x] **Icon Rail Geçişi:** 2 tab'li yapı yerine sol kenar dikey navigasyon (48px).
*   [x] **Modüler Refaktör:** `BackupModule`, `RestoreModule` ve `SettingsModule` ayrıştırıldı.
*   [x] **Merkezi State:** `AppContext` ile modüller arası state yönetimi sağlandı.
*   [x] **Performans Fix:** Ekran titremesi (flickering) `backdrop-blur` temizliğiyle giderildi.
*   [x] **Görsel Standartlar:** `ADB_UI Spec 2.0` (Opaklık tokenları, neon glow) uygulandı.

---

## 🧩 FAZ 2: Etkileşim & İşlevsellik (Terminal & Debloater) [TAMAMLANDI ✅]
**Amaç:** Uygulamanın teknik gücünü artırmak ve "Teknisyen" profili için araç setini genişletmek.

### Adım 1: Terminal Modülü (Interactive Shell) [TAMAMLANDI ✅]
*   [x] `TerminalModule.tsx` bileşenini oluştur (Sidebar ve View olarak ayrıştırıldı).
*   [x] Backend entegrasyonu (ADB & Fastboot birleşik komut yürütücü).
*   [x] Terminal UI: Siyah arka plan, monospace font, input satırı.
*   [x] Hazır makro butonları (Reboot, Recovery, Fastboot, Info, Packages).
*   [x] **Ek Performans:** ADB/Fastboot araçları eksikse otomatik indirme/kurulum mekanizması.
*   [x] **Ek Görsel:** Reboot seçenekleri için Retro-Amber (kehribar) renk teması.

### Adım 2: Debloater Modülü (System App Manager) [TAMAMLANDI ✅]
*   [x] `DebloaterModule.tsx` bileşenini oluştur (Sidebar + View ayrımı).
*   [x] `useDebloater.ts` hook'u ile state yönetimi.
*   [x] Paket listesini filtrele (All, System, User, Disabled).
*   [x] Arama özelliği ve toplu seçim (Select All).
*   [x] Disable (Dondur) ve Enable (Aç) işlemleri.
*   [x] Uninstall (Kaldır) işlemi (--user 0 ile güvenli).
*   [x] Uyarı mekanizması (Sistem paketleri için risk uyarısı modalı).

---

## 🚦 FAZ 3: Geri Bildirim & Akıcılık (Progress & Feedback) [KISMEN TAMAMLANDI ⏳]
**Amaç:** Kullanıcının sistemle iletişimini güçlendirmek ve işlem durumunu netleştirmek (UX Yasaları).

### Adım 1: İlerleme Göstergeleri (Progress Bars)
*   [x] **Minimalist Progress Line:** Log paneli kapalıyken header altında 2px'lik neon hat (Animasyonlu).
*   [x] **Backup Management:** Yedek listesinde hover ile erişilebilen "Sil" (Delete) özelliği.
*   [x] `LogPanel` içine entegre progress bar (Batch işlemleri için).
*   [x] Modül üzerinde dairesel progress (tekil işlemler için).
*   [x] İşlem bitişinde ses/bildirim [TAMAMLANDI ✅].

### Adım 2: Klavye Kısayolları (Power Users)[PAS GEÇİLDİ ⏩]
*   [-] `Ctrl+B` (Backup), `Ctrl+R` (Restore), `Ctrl+T` (Terminal).
*   [-] `Ctrl+F` (Arama odağı).
*   [-] `Esc` (Seçimi iptal et / Modaldan çık).

---

## 🏗️ FAZ 4: Profesyonel Dokunuşlar (Onboarding & About)
**Amaç:** Güven oluşturmak ve yeni kullanıcı deneyimini iyileştirmek.

### Adım 1: About & Info [TAMAMLANDI ✅]
*   [x] `SettingsModule` içine "About" sekmesi.
*   [x] Versiyon, Lisans, GitHub linki.
*   [x] Güncelleme kontrolü (Update checker placeholder).

### Adım 2: İlk Kullanım (Onboarding) [PAS GEÇİLDİ ⏩]
*   [-] ADB bağlantısı yoksa "Nasıl bağlanırım?" rehberi (Ertelendi).
*   [-] Tooltip sistemi (Ertelendi).

---

## 🧪 FAZ 5: Deneysel Özellikler (Ideas)
**Amaç:** Gelecek fikirleri test etmek.

*   [ ] **Wireless Debugging:** QR kod veya IP ile bağlantı.
*   [ ] **File Manager:** Cihaz dosyalarını gezgin (Explorer) gibi görüntüleme.
*   [ ] **Theme Engine:** Neon renklerini değiştirme (Cyan, Amber, Red Alert).

---

## 📊 Özet Durum Tablosu

| Faz | Odak | Durum |
|-----|------|-------|
| **FAZ 1** | Mimari | ✅ TAMAMLANDI |
| **FAZ 2** | İşlevsellik | ✅ TAMAMLANDI |
| **FAZ 3** | UX & Feedback | ✅ KISMEN TAMAMLANDI |
| **FAZ 4** | Polish | ⏳ BEKLEMEDE |
| **FAZ 5** | Future | 🔮 FİKİR |
