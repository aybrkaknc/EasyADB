# Proje Geniş Hata Ayıklama (Debug) ve Stabilizasyon Planı

Bu döküman, EasyADB projesinde karşılaşılan hataların sistematik bir şekilde nasıl çözüleceğini, hangi sırayla ilerlenmesi gerektiğini ve projenin genel stabilitesinin nasıl korunacağını tanımlayan ana rehberdir.

---

## 🚀 1. Genel Debug Metodolojisi (Adım Adım)

Bir sorunla karşılaşıldığında izlenmesi gereken standart süreç:

1.  **Sorunu Tanımla ve İzole Et (Define & Isolate):**
    *   Hata nerede gerçekleşiyor? (UI, Backend, Veri Akışı?)
    *   Hata her zaman mı oluyor yoksa belirli şartlarda mı?
    *   Hata mesajını tam olarak oku (Terminal ve Console logları).

2.  **Kök Neden Analizi (Root Cause Analysis - RCA):**
    *   **Backend (Rust):** `lib.rs` içindeki Tauri komutlarını kontrol et. Parametreler doğru geliyor mu? Rust tarafında panik/hata var mı?
    *   **Frontend (React):** Hook'lar veriyi doğru çekiyor mu? State desync (senkronizasyon kaybı) var mı?
    *   **İletişim:** `invoke` çağrıları doğru parametrelerle mi yapılıyor?

3.  **Çözümü Planla:**
    *   En basit ve en kalıcı çözümü düşün.
    *   "Quick fix" (geçici çözüm) yerine mimariyi düzeltecek bir yaklaşım seç (Örn: Hook extraction).

4.  **Uygula ve Test Et:**
    *   Önce en kritik (P0) hatayı düzelt.
    *   Ardından type safety ve temiz kod iyileştirmelerini yap.

5.  **Doğrula ve Belgele:**
    *   Manuel testleri yap.
    *   Otomatik testleri çalıştır (`npm test`).
    *   Değişiklikleri `CHANGELOG.md` dosyasına işle.

---

## 🛠️ 2. Katmanlara Göre Debug Araçları

### A. Backend (Rust / Tauri)
*   **Loglar:** `println!` veya tauri-plugin-log kullan.
*   **Terminal:** `npm run tauri dev` çıktısını takip et. Cargo uyarılarını ciddiye al.
*   **Hata Dönüşleri:** Rust tarafında `Result<T, String>` kullanarak hataları frontend'e anlamlı mesajlarla ilet.

### B. Frontend (React / TypeScript)
*   **Tauri DevTools:** `Ctrl + Shift + I` ile konsolu kontrol et.
*   **React DevTools:** State değişimlerini ve gereksiz render'ları izle.
*   **TypeScript:** `npx tsc --noEmit` ile tip hatalarını kod çalışmadan yakala.

---

## 📋 3. Standart Test Protokolü

Yeni bir özellik veya debug sonrası mutlaka bu sırayla kontrol edilmelidir:

1.  **Derleme Kontrolü:** `npm run tauri dev` ve `tsc` hataları sıfır olmalı.
2.  **Bağlantı Kontrolü:** Cihaz bağlandığında ve koptuğunda UI doğru tepki vermeli.
3.  **Veri Akışı:** Listeler (Backups, Packages) güncel ve doğru klasörden geliyor olmalı.
4.  **İşlem Başarısı:** Yedekleme/Geri yükleme gibi uzun süren işlemlerin progress bar ve sonuçları doğrulanmalı.

---

## 📖 4. Vaka Analizi: Backup Modülü Stabilizasyonu (Örnek)

Bu planın ilk başarısı Backup modülünde şu sırayla uygulandı:

*   **1. Aşama (P0):** Custom path hatası düzeltildi (Backend parametre eksikliği giderildi).
*   **2. Aşama (P1):** `useBackupOperations` hook'u oluşturularak state merkezi hale getirildi (Mimari iyileştirme).
*   **3. Aşama (P2-P3):** Tip güvenliği (`FilterTabProps`) ve kod tekrarı (`SelectableListItem`) düzeltildi (Kod kalitesi).
*   **4. Aşama (P4):** Otomatik test altyapısı (Vitest) kuruldu (Gelecek garantisi).

---

## 🛡️ 5. Stabilite Koruma Kuralları

*   **Atomic Commits:** Her commit tek bir mantıksal değişikliği temsil etmeli.
*   **Single Source of Truth:** Bir veri (örn: yedek listesi) sadece bir yerden yönetilmeli.
*   **Type over `any`:** Asla `any` kullanma, her zaman interface tanımla.
*   **Documentation:** Her büyük debug seansından sonra `CHANGELOG.md` güncellenmeli.
