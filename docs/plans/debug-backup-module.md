# Debug & Stability Plan: Backup Module

Bu döküman, Backup modülünde gerçekleştirilen hata ayıklama (debug) ve stabilizasyon stratejisini özetler. Gelecekteki benzer sorunları önlemek için bir yol haritası sunar.

## 1. Mevcut Durum Analizi (P0 Tespiti)
Hata ayıklama süreci iki ana sorunun tespitiyle başladı:
1. **Custom Path Bug:** Kullanıcı yedekleme yolunu değiştirse bile backend her zaman varsayılan klasörü tarıyordu.
2. **State Desync:** `BackupModule` ve `App.tsx` arasındaki veri akışı senkronize değildi, bu da yeni alınan yedeklerin listede hemen görünmemesine neden oluyordu.

---

## 2. Uygulanan Debug Stratejisi

### Faz 1: Kök Neden Analizi (Root Cause Analysis)
- **Backend:** `src-tauri/src/lib.rs` dosyasındaki `list_backups` fonksiyonunun `custom_path` parametresini almadığı tespit edildi.
- **Frontend:** `useBackups` hook'unun parametreleri backend'e iletmediği ve `BackupModule`'ün kendi içinde bağımsız veri çektiği (duplicate hook calls) belirlendi.

### Faz 2: Mimari Refactoring (P1)
- **Single Source of Truth:** Tüm backup state'i `useBackupOperations` hook'una taşındı.
- **App.tsx Sadeleştirme:** Ana component'in sorumluluğu sadece orchestrator (modül yönetimi) seviyesine indirildi.

### Faz 3: Kod Güçlendirme (P2 & P3)
- **Type Safety:** `any` tipleri kaldırılarak TypeScript interface'leri eklendi.
- **DRY (Don't Repeat Yourself):** `SelectableListItem` ortak bileşeni ile görsel ve mantıksal tutarlılık sağlandı.

### Faz 4: Doğrulama (Verification & P4)
- **is_system Guard:** `undefined` veri gelme durumuna karşı koruma eklendi.
- **Otomatik Testler:** Vitest entegrasyonu ile temel UI davranışları test altına alındı.

---

## 3. Manuel Test Protokolü
Her büyük değişiklikten sonra uygulanacak standart test adımları:

1. **Bağlantı Testi:** Cihaz bağlı/bağlı değil durumunda seçimlerin temizlendiğini doğrula.
2. **Konum Testi:** Ayarlardan klasör değiştirince "RESTORE" listesinin güncellendiğini doğrula.
3. **Senkronizasyon Testi:** Yeni bir yedek aldıktan sonra listenin otomatik yenilendiğini doğrula.
4. **Filtre Testi:** User/System/All sekmelerinin doğru renk ve içerik gösterdiğini doğrula.

---

## 4. Gelecek Planı (Maintenance Plan)

- [ ] **E2E Testler:** Playwright ile gerçek bir ADB simülatörü üzerinden yedekleme akışını test et.
- [ ] **Log Entegrasyonu:** `useBackupOperations` içindeki hataları otomatik olarak global Log paneline ilet.
- [ ] **Performance Audit:** Büyük paket listelerinde (500+) `SelectableListItem` render performansını ölç.
- [ ] **Type Centralization:** `adb.ts` içindeki tipleri daha modüler hale getir.

---

## 🛠️ Kullanılan Araçlar
- **Framework:** Vitest, React Testing Library
- **Environment:** jsdom
- **Debugging:** Tauri Logs, Chrome DevTools
