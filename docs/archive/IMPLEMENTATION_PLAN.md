@import './.agent/skills/plan-writing/SKILL.md';

# EasyBackupADB Uygulama Planı (Güncellendi)

## Hedef
Taşınabilir (Portable), "Hacker Terminal" görünümlü ve Gömülü ADB kullanan Android yedekleme aracı.

## Görevler - Faz 1: Temel & Gömülü Sistem [TAMAMLANDI]
- [x] **Proje Başlat:** Tauri + React + TS kurulumu.
- [x] **UI Teması:** "Hacker Terminal" teması (Siyah/Neon Yeşil/Scanline efektleri).
- [x] **Gömülü ADB (Rust):** ADB dosyalarını temp'e çıkarma ve crash önleme.
- [x] **Terminal Log UI:** Log Paneli bileşeni (Dinamik boyutlandırma ve animasyonlar).

## Görevler - Faz 2: Yedekleme Motoru [TAMAMLANDI]
- [x] **ADB Device Status:** `adb devices` ve Root durumu tespiti.
- [x] **Cihaz Bağlantısı:** Frontend entegrasyonu (Connected/Disconnected/Root status).
- [x] **Paket Listeleme:** `adb shell pm list packages` ve meta-veri ayrıştırma.
- [x] **Batch Backup UI:** Sidebar üzerinden çoklu seçim ve "TARGETS LOCKED" görünümü.
- [x] **Dosya Yapısı:** `.easybckp` (Zipped APK) formatında yedek alma.

## Görevler - Faz 3: Geri Yükleme (Restore) [TAMAMLANDI]
- [x] **Yedek Taraması:** İndirilenler (Downloads) klasöründeki `.easybckp` dosyalarını listeleme.
- [x] **Dosya Metadata:** Yedekleme tarihi, boyutu ve paket ismi bilgilerini backend'den çekme.
- [x] **Batch Restore:** Birden fazla yedeği sırayla cihaza geri yükleme.
- [x] **Entegrasyon:** Sidebar mod değiştirici (Backup/Restore sekmeleri).

## Görevler - Faz 4: Cila & Optimizasyon (Aktif)
- [x] **UI Rafine:** Header temizliği, font boyutları ve mod seçici taşıma.
- [x] **Fonksiyonel İyileştirme:** Manuel yenileme (Refresh) butonları.
- [x] **Dinamik Layout:** Terminal açıldığında ana içeriğin daralması.
- [ ] **Hata Yönetimi:** Daha kapsamlı ADB hata yakalama süreçleri.
- [ ] **Performans:** İleri seviye paket boyutu önbellekleme (Size Cache) geliştirmesi.

## Bittiğinde (Done When)
- [x] USB belleğime `.exe`'yi atıp başka (ADB olmayan) bir PC'ye taktığımda çalışıyor.
- [x] Yedek aldığımda tek bir dosya oluşuyor (`.easybckp`).
- [x] O dosyadan uygulama geri yüklenebiliyor.
