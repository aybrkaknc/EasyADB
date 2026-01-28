# 🗺️ EasyADB Geliştirme Yol Haritası

> **Durum:** 🟡 Aktif Geliştirme  
> **Odak:** Modüler Stabilizasyon ve Performans

---

## ✅ Tamamlanan Modüller

### 1. Backup Modülü (Stable)
- [x] **1a. Temel Fonksiyonlar:** Yedekleme listeleme, silme, oluşturma.
- [x] **1b. Mimari:** `useBackupOperations` hook refactor.
- [x] **1c. UI/UX:** Progress bar, hata bildirimleri.
- [x] **1d. Performans:** `react-virtuoso` ile liste sanallaştırma.

### 2. Restore Modülü (Stable)
- [x] **2a. Kritik Hatalar:** Custom path sorunu, liste yenileme.
- [x] **2b. Güvenlik:** Root data permissions (chown/restorecon).
- [x] **2c. UI:** Cyberpunk Error Dialog entegrasyonu.

---

## 🚧 Aktif Geliştirme

### 3. Debloater Modülü (✅ Bitti)
*Amaç: Sistem temizliği ve güvenli paket yönetimi.*
- [x] **3a. Güvenlik Kalkanı:** Kritik işlemlerde Confirmation Dialog + Risk Etiketleri.
- [x] **3b. Hata Yönetimi:** Batch işlemler için Global Error Dialog entegrasyonu.
- [x] **3c. Logic Refactor:** `useDebloater` hook'u stabilize edildi.
- [x] **3d. Performans Optimizasyonu:** `react-virtuoso` ile liste sanallaştırma.
- [x] **3e. UI İyileştirmesi:** "Select All" header bileşeni.

---

## 🚧 Aktif Geliştirme

### 4. Terminal Modülü (Aktif - %33)
*Amaç: Kullanıcıya tam kontrol sağlamak.*

- [x] **4a. Gelişmiş Tarihçe (History):**
    - [x] Komut geçmişini kaydetme (localStorage).
    - [x] Yukarı/Aşağı ok tuşları ile gezinme.
- [ ] **4b. Akıllı Tamamlama (IntelliSense):**
    - [ ] ADB komutlarını tamamlama.
    - [ ] Dosya yollarını (remote) tamamlama.
- [ ] **4c. Görsel İyileştirme:**
    - [ ] ANSI renk kodlarını (xterm) destekleme.

### 5. Performance Modülü
*Amaç: Cihaz sağlığını izlemek.*

- [ ] **5a. Veri Toplama:**
    - [ ] RAM, CPU, Battery verilerini anlık (1s) çekmek.
- [ ] **5b. Görselleştirme:**
    - [ ] `recharts` ile canlı grafik (Live Chart).

### 6. Core & Settings
*Amaç: Uygulama altyapısı.*

- [ ] **6a. Ayarlar:**
    - [ ] Tema seçimi.
    - [ ] Varsayılan yedekleme yolu.
- [ ] **6b. Dil Desteği:**
    - [ ] i18n altyapısı (TR/EN).

---

## 📊 İlerleme Özeti

| Modül | Durum | Yüzde |
|-------|-------|-------|
| **1. Backup** | ✅ Bitti | 100% |
| **2. Restore** | ✅ Bitti | 100% |
| **3. Debloater**| ✅ Bitti | 100% |
| **4. Terminal** | 🟡 Aktif | 33% |
| **5. Performance**| ⬜ Bekliyor | 0% |
