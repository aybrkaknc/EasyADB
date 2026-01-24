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

## Faz 3: Sistem Yönetimi (Debloater) [TAMAMLANDI]
- [x] **Debloater Modülü:** Sistem ve Kullanıcı uygulamalarını ayrıştırma.
- [x] Toplu Kaldırma (Uninstall) ve Devre Dışı Bırakma (Disable).
- [x] Geri Getirme (Reinstall/Enable) özellikleri.
- [x] Kritik sistem uygulamaları için güvenlik uyarısı.

## Faz 4: Güçlü Özellikler (Power User) [AKTİF]
- [x] **Hybrid Backup (Root):** Root yetkisi ile `/data/data` yedekleme.
- [x] **Minimalist Progress:** Log paneline entegre 2px neon ilerleme hattı.
- [x] **Real-time Sideload:** Terminal üzerinden yüzdeli ilerleme çubuğu ile ROM/Update yükleme. [YENİ]
- [ ] **Kablosuz Hata Ayıklama:** QR kod veya IP ile kablosuz bağlantı.

## Faz 5: Debloater İstihbaratı (Intelligence) [TAMAMLANDI]
> *UAD-NG Analizi Sonrası Eklenen Özellikler*
- [x] **Güvenlik Derecelendirmesi (Safety Ratings):** Paketleri risk seviyesine göre (Safe, Advanced, Unsafe, Expert) renklendirme.
- [x] **Bilgi Bankası (Knowledge Base):** Paketlerin ne işe yaradığını gösteren açıklama paneli (Embedded JSON).
- [ ] **Restore Center:** Silinen sistem uygulamalarını tek tıkla geri getirmek için özel sekme.
- [ ] **Profil Yönetimi:** Debloat listelerini dışa/içe aktarma (Import/Export Preset).

## Faz 6: Akıllı Hata Ayıklama & Donanım [AKTİF]
- [x] **Smart Error Analysis:** Karmaşık ADB hatalarını insan diline çeviren çözüm merkezi. [YENİ]
- [x] **One-Click Fix:** Hata panelinden tek tıkla ADB server yenileme. [YENİ]
- [ ] **Performans Paneli:** CPU, RAM ve Pil sıcaklığı için canlı neon grafikler.
- [ ] **Kablosuz Hata Ayıklama:** QR kod veya IP ile kablosuz bağlantı sihirbazı.

## Faz 7: Cila & Dağıtım
- [x] **UI/UX:** Compact Sidebar, IconRail, Optimized Log Panel.
- [ ] **Hata Ayıklama:** Detaylı hata mesajları ve çözüm önerileri.
- [ ] **Dağıtım:** `.exe` ve `.msi` paketleme (Portable Mode optimizasyonu).

---
