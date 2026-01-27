# Proje Yol Haritası (Roadmap) - EasyADB

> **Hedef:** Tauri 2.0 & Rust kullanarak HyperOS/AOSP uyumlu, güçlü ve modern bir Android yönetim aracı inşa etmek.

---

## Faz 1: Temeller ("Merhaba Dünya") [TAMAMLANDI]
- [x] Tauri 2.0 + React + TypeScript + Tailwind CSS altyapısı.
- [x] Gömülü ADB binary yönetimi.
- [x] Cihaz bağlantı ve durum takibi.

## Faz 2: Çekirdek (Yedekleme & Geri Yükleme) [TAMAMLANDI]
- [x] **Yedekleme:** Batch APK yedekleme ve `.easybckp` formatı.
- [x] **Geri Yükleme:** Yedekleri listeleme ve cihaza kurma.
- [x] **Universal Backup:** Split APK (App Bundle), OBB ve Root Data desteği (v3.0).
- [x] **Yedek Yönetimi:** Yedekleri uygulama içinden silme (delete_backup).
- [x] **BIT_SIZE Optimization:** Toplu seçimlerde asenkron boyut hesaplama motoru. [YENİ]

## Faz 3: Sistem Yönetimi (Debloater) [TAMAMLANDI]
- [x] **Debloater Modülü:** Sistem ve Kullanıcı uygulamalarını ayrıştırma.
- [x] Toplu Kaldırma (Uninstall) ve Devre Dışı Bırakma (Disable).
- [x] Geri Getirme (Reinstall/Enable) özellikleri.
- [x] Kritik sistem uygulamaları için güvenlik uyarısı.
- [x] **Debounced Search:** Performanslı ve takılmayan paket arama motoru. [YENİ]

## Faz 4: Güçlü Özellikler (Power User) [TAMAMLANDI]
- [x] **Hybrid Backup (Root):** Root yetkisi ile `/data/data` yedekleme.
- [x] **Real-time Sideload:** Terminal üzerinden yüzdeli ilerleme çubuğu ile ROM/Update yükleme.
- [x] **Interactive Terminal:** Gerçek zamanlı, log akışına gömülü interaktif komut satırı. [YENİ]
- [x] **Advanced Macros:** Tek tıkla Reboot, Recovery ve Diagnostic komutları.

## Faz 5: Tasarım Dili ve Standartlar (ADB_UI) [TAMAMLANDI]
- [x] **Spec v1.5:** Proje genelinde HUD (Heads-Up Display) tasarım standartları.
- [x] **Unified Headers:** Tüm modüllerde (Backup, Restore, Debloater, Terminal) ortak başlık yapısı.
- [x] **Minimalist UI:** No-Footer politikası ve kutusuz (borderless) metin göstergeleri.
- [x] **Görsel Fix:** Uygulama genelinde scroll ve tıklama engellerinin kaldırılması.

## Faz 6: Akıllı Hata Ayıklama & Donanım [TAMAMLANDI]
- [x] **Smart Error Analysis:** Karmaşık ADB hatalarını insan diline çeviren çözüm merkezi.
- [x] **One-Click Fix:** Hata panelinden tek tıkla ADB server yenileme.
- [x] **Performans Dashboard:** CPU, RAM, Pil Sıcaklığı ve Uptime takibi.
- [x] **Hardware Inventory:** Cihazın donanım kimliğini (SoC, Display, Android Ver) listeleyen detaylı rapor.

## Faz 7: Kablosuz & Dağıtım [SIRADAKİ]
- [ ] **Kablosuz Hata Ayıklama:** QR kod veya IP ile kablosuz bağlantı sihirbazı.
- [ ] **Profil Yönetimi:** Debloat listelerini dışa/içe aktarma (Import/Export Preset).
- [ ] **Dağıtım:** `.exe` ve `.msi` paketleme (Portable Mode optimizasyonu).

---
*Son Güncelleme: 24 Ocak 2026*
