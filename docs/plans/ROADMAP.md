# 🗺️ EasyADB Proje Yol Haritası (Roadmap)

> **Hedef:** Tauri 2.0 & Rust kullanarak HyperOS/AOSP uyumlu, güçlü ve modern bir Android yönetim aracı inşa etmek.

---

## ✅ TAMAMLANAN ÖZELLİKLER (COMPLETED)

### 🏗️ 1. Temel Altyapı & Cihaz Yönetimi
- [x] **Framework:** Tauri 2.0 + React + TypeScript + Tailwind CSS entegrasyonu.
- [x] **ADB Engine:** Gömülü ADB binary yönetimi ve server kontrolü.
- [x] **Smart Monitoring:** CPU, RAM ve Pil durumunu gösteren Gerçek Zamanlı Dashboard.
- [x] **Hardware Inventory:** Detaylı SoC, ekran ve işletim sistemi raporlama.
- [x] **Connection:** Cihaz bağlantı/durum takibi ve anlık bildirimler.

### 📦 2. Uygulama & Yedekleme Motoru
- [x] **Yedekleme:** Batch APK yedekleme ve özel `.easybckp` formatı.
- [x] **Geri Yükleme:** Yedek dosyalarını listeleme ve tek tıkla kurulum.
- [x] **Universal Backup:** App Bundle (Split APK), OBB ve Root Data desteği.
- [x] **App Management:** Yedekleri uygulama içinden silme ve yönetme.
- [x] **Optimization:** Toplu seçimlerde asenkron boyut hesaplama motoru (BIT_SIZE).

### 🛡️ 3. Sistem & Güçlü Kullanıcı Araçları
- [x] **Debloater:** Sistem/Kullanıcı uygulamalarını ayrıştırma ve toplu Uninstall/Disable.
- [x] **Safety First:** Kritik paketler için güvenlik uyarıları ve "Geri Getir" (Enable) desteği.
- [x] **Interactive Terminal:** Komut geçmişini takip eden, kelime kelime öneri sunan akıllı terminal.
- [x] **Sideload Engine:** OTA/ROM yüklemeleri için % ilerleme çubuklu stream desteği.
- [x] **Macros:** Tek tıkla Reboot, Recovery ve Diagnostic komutları.

### 🎨 4. Tasarım & UX (ADB_UI Spec v1.5)
- [x] **Unified HUD:** Tüm modüllerde ortak başlık ve navigasyon dili.
- [x] **Modern Estetik:** No-Footer politikası, kutusuz metin göstergeleri ve responsive tasarım.
- [x] **Performance UI:** Responsive dikey akordeon yapısı (System Monitor).
- [x] **Smart Fix:** ADB hatalarını insan diline çeviren çözüm merkezi (Smart Error Analysis).

---

## 🚀 GELECEK PLANLAR (PENDING / BACKLOG)

### 📡 Faz 1: Bağlantı & Dağıtım (Sıradaki)
- [ ] **Kablosuz Hata Ayıklama:** QR kod veya IP ile kablosuz bağlantı sihirbazı.
- [ ] **Dağıtım:** `.exe` ve `.msi` paketleme (Portable Mode optimizasyonu).
- [ ] **Profil Yönetimi:** Debloat listelerini dışa/içe aktarma (Import/Export Preset).

### 📂 Faz 2: Dosya Yönetimi (File Explorer) [PLANLANDI]
- [ ] **Live Navigation:** Cihaz klasörleri arasında akıcı gezinme.
- [ ] **File Operations:** Klasör oluşturma, silme, taşıma ve yeniden adlandırma.
- [ ] **Smart Push/Pull:** Sürükle-bırak ile dosya transferi ve progress monitoring.
- [ ] **Media Preview:** Resim ve APK dosyaları için önizleme desteği.

### 🔍 Faz 3: Sistem Günlüğü (Logcat Viewer) [PLANLANDI]
- [ ] **Real-time Stream:** Yüksek performanslı, sanallaştırılmış log akışı.
- [ ] **Smart Filtering:** Seviye (Level) ve Etiket (Tag) bazlı anlık filtreleme.
- [ ] **Search & Highlight:** Regex destekli gelişmiş arama.
- [ ] **Session Export:** Log çıktılarını dışa aktarma ve analiz raporu.

---
*Son Güncelleme: 28 Ocak 2026*
