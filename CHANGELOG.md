# Changelog

Tüm önemli değişiklikler bu dosyada belgelenir.

Format [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) standardına dayanır.
Versiyon numaralandırması [Semantic Versioning](https://semver.org/spec/v2.0.0.html) takip eder.

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
