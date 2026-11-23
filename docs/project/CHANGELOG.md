# Changelog

Tüm önemli değişiklikler bu dosyada belgelenir.

Format [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) standardına dayanır.
Versiyon numaralandırması [Semantic Versioning](https://semver.org/spec/v2.0.0.html) takip eder.

---

## [0.2.0] - 2026-11-23

Uygulama sıfırdan yeniden yazıldı. Eski `.easybckp` yedekleri bu sürümle okunmaz.

### Eklenenler
- Birden fazla cihaz desteği, cihaz seçici ve yetkisiz/çevrimdışı cihazlar için adım adım rehber
- Klasör tabanlı yedek biçimi (v1): akışlı aktarım, SHA-256, isteğe bağlı AES-256-GCM şifreleme, `.easybckp` dışa/içe aktarma
- UAD-NG verileriyle debloat, toplu işlemler ve profiller
- Kablosuz hata ayıklama: eşleştirme kodu, QR kod, IP ve `adb tcpip`
- Canlı çıktılı ve iptal edilebilir terminal
- Dosya yöneticisi ve logcat görüntüleyici
- Ağ, depolama ve sıcaklık bilgileriyle performans modülü
- İngilizce ve Türkçe arayüz, klavye kısayolları, sistem tepsisi, Windows bildirimleri
- Sabit sürümlü ve SHA-256 doğrulamalı platform-tools; sidecar olarak paketleme
- `.msi` kurulum paketi (TR/EN, WebView2 bootstrapper), GitHub Actions CI ve yayın
- Rust, Vitest ve Playwright testleri

### Değişenler
- Lisans GPL-3.0 oldu
- Tüm ADB çağrıları tek istemciden geçiyor; cihaz kabuk argümanları tırnaklanıyor
- Sıkı CSP ve minimum Tauri izinleri

### Kaldırılanlar
- Play Store'dan uygulama adı çekme
- Eski yedek biçimi ve gömülü `include_bytes!` ADB

---

## [0.1.1] - 2026-01-28

### 🐛 Bug Fixes

- **P0: Custom Backup Path Fix**
  - Özel yedekleme klasörü seçildiğinde yedekler artık doğru konuma kaydediliyor
  - Backend `list_backups` fonksiyonu artık custom path parametresini destekliyor
  - Frontend `useBackups` hook'u path değişikliklerini doğru şekilde algılıyor

### ♻️ Refactoring

- **P1: State Management Refactor**
  - Yeni `useBackupOperations` hook'u oluşturuldu
  - `App.tsx` ~500 satırdan ~240 satıra düşürüldü (%50 azalma)
  - "God Component" anti-pattern'i giderildi
  - Backup state ve business logic artık tek bir hook'ta

- **P2: Type Safety Improvements**
  - `FilterTab` component'ine proper TypeScript interface eklendi
  - `any` tipi kaldırıldı, compile-time tip güvenliği sağlandı

- **P3: DRY Principle (Code Reuse)**
  - `SelectableListItem` ortak component'i oluşturuldu
  - `PackageItem` ve `ArchiveItem` artık bu base component'i kullanıyor
  - Checkbox ve hover logic tek yerde yönetiliyor

- **P4: Undefined Safety**
  - `isSystemPackage()` helper fonksiyonu eklendi
  - `is_system` undefined durumu güvenli şekilde handle ediliyor

### ✨ New Features

- **Test Infrastructure**
  - Vitest + Testing Library + jsdom kuruldu
  - `BackupModule` için 11 unit test eklendi
  - `npm test`, `npm run test:watch`, `npm run test:coverage` komutları eklendi

### 📁 Dosya Değişiklikleri

| Dosya | Değişiklik |
|-------|------------|
| `src/hooks/useBackupOperations.ts` | ✨ Yeni |
| `src/test/setup.ts` | ✨ Yeni |
| `src/test/setup.test.tsx` | ✨ Yeni |
| `src/components/modules/BackupModule.test.tsx` | ✨ Yeni |
| `vitest.config.ts` | ✨ Yeni |
| `src/App.tsx` | ♻️ Refactor |
| `src/components/modules/BackupModule.tsx` | ♻️ Refactor |
| `src/types/adb.ts` | ➕ Helper fonksiyon |
| `src-tauri/src/lib.rs` | 🐛 Fix |
| `src/hooks/useBackups.ts` | 🐛 Fix |
| `package.json` | ➕ Test scripts |

---

## [0.1.2] - 2026-01-28

### 🐛 Bug Fixes (Restore Modülü)

- **P0 #1: Custom Path Restore**
  - Settings'den seçilen özel klasör artık Restore modülünde kullanılıyor
  - `App.tsx`: `customPath` prop RestoreModule'a geçiriliyor

- **P0 #2: Refresh Butonu**
  - Restore listesinde refresh butonu artık çalışıyor
  - `refreshTrigger` dinamik state olarak export ediliyor

- **P0 #3: Hata Yönetimi**
  - Restore hataları artık kullanıcıya gösteriliyor
  - `failedItems` takibi eklendi
  - Bildirimler başarı/hata durumuna göre ayrıştırıldı

- **P1 #4: Root Data Extraction**
  - tar extract path düzeltildi
  - Çift iç içe klasör sorunu giderildi

- **P1 #5: Permission Fix**
  - Root restore sonrası `chown` komutu eklendi
  - SELinux context için `restorecon` eklendi

- **P1 #6: Overlay Kapanma**
  - Hatalı tamamlanmalarda da overlay kapanıyor
  - "Completed with X error(s)" kontrolü eklendi

- **P2 #8: Ölü Kod Temizliği**
  - Kullanılmayan `RestoreConfirmationView.tsx` silindi

- **P2 #9: Delete Hata Bildirimi**
  - Backup silme hatası artık kullanıcıya gösteriliyor

- **P3 #10: Tip Senkronizasyonu**
  - Frontend ve Backend `BackupFile` tanımlarına sync uyarıları eklendi

- **P3 #11: Magic Numbers Refactor**
  - `adb.rs` içindeki `1024` sabiti `MIN_VALID_APK_SIZE` olarak tanımlandı

- **P3 #12: Dokümantasyon**
  - `restore_package` fonksiyonuna Rustdoc eklendi

### ✨ UI Improvements

- **Global Error Dialog (Cyberpunk Style)**
  - Standart `alert()` yerine custom `AlertDialog` bileşeni eklendi
  - Hata mesajları artık sistem temasına uygun gösteriliyor

### 🔒 Debloater Security & VX
- **Safety Confirmation:** Kritik (Sistem) uygulama işlemleri için Kırmızı Uyarı eklendi.
- **Batch Error Handling:** Debloater hataları artık global dialog ile gösteriliyor.
- **AlertDialog Upgrade:** `onConfirm` callback desteği ile "İki Butonlu" mod eklendi.

### 📁 Dosya Değişiklikleri

| Dosya | Değişiklik |
|-------|------------|
| `src/App.tsx` | ✨ Debloater Dialog Entegrasyonu |
| `src/hooks/useDebloater.ts` | ✨ confirmState + errorState entegrasyonu |
| `src/components/views/AlertDialog.tsx` | ♻️ Warning Modu + Confirm Butonları |
| `src/hooks/useBackupOperations.ts` | 🐛 Hata yönetimi + refreshTrigger export + delete alert |
| `src/types/adb.ts` | ➕ `failedItems` property + Sync comment |
| `src-tauri/src/adb.rs` | 🐛 chown/restorecon + 📝 Rustdoc + ♻️ Constants |
| `src-tauri/src/lib.rs` | 📝 Sync comment |
| `src/components/views/BackupOverlay.tsx` | 🐛 Hata gösterimi + isFinished genişletildi |

---

## [0.1.0] - 2026-01-XX (Initial Release)

### ✨ Features

- Backup & Restore modülü
- Debloater modülü
- Terminal modülü
- Performance modülü
- Cihaz bağlantı yönetimi
- Sistem/Kullanıcı uygulama filtreleme
- Batch backup/restore işlemleri

---

### Legend

- ✨ New feature
- 🐛 Bug fix
- ♻️ Refactoring
- ➕ Addition
- ➖ Removal
- 📝 Documentation
