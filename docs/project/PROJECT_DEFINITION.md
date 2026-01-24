@import './.agent/skills/plan-writing/SKILL.md';

# EasyADB - Proje Tanımı

> **Özet:** Custom ROM tutkunları için yüksek performanslı, taşınabilir (portable) ve "Hacker Terminal" estetiğine sahip Android yedekleme yöneticisi.

---

## 1. Proje Genel Bakışı

**Problem:** Custom ROM kullanıcıları cihazlarını sık sık sıfırlar. Yedeği almak ve geri yüklemek zahmetlidir.
**Çözüm:** Tauri 2.0 (Rust) backend'i ve gömülü ADB ikilisi ile çalışan, USB bellekte taşınabilen (Portable) tek bir `.exe` dosyası.
**Vizyon:** "Hacker Terminal" estetiğinde, neon/siyah tasarımlı, tek dosya arşiv formatı (`.easybckp`) kullanan güçlü bir araç.

---

## 2. Teknoloji Yığını Mimarisi (Tech Stack)

**Karar:** Seçenek 1 (Güç Merkezi) - **Tauri 2.0 + Rust + React**

| Katman | Teknoloji | Gerekçe |
|-------|------------|-----------|
| **Çatı (Framework)** | **Tauri 2.0 (Rust)** | Kurulumsuz (Portable) `.exe` oluşturmak için en iyi seçenek. |
| **Backend** | **Rust** | ADB'yi gömmek (`embed`) ve dosya işlemlerini (zip/tar) RAM'de hızlıca yapmak için. |
| **Frontend** | **React + Tailwind** | "Hacker Terminal UI" görünümünü (Simsiyah arka plan, monospaced fontlar) kolayca kodlamak için. |
| **ADB Stratejisi** | **Gömülü (Embedded)** | `adb.exe` programın içine gömülür. Kullanıcıda kurulu olmasa bile çalışır. |

---

## 3. Temel Özellikler (MVP+)

1.  **Tamamen Taşınabilir (Portable):** Kurulum yok. `EasyADB.exe` çalışır, işini yapar, kapatınca iz bırakmaz.
2.  **Gömülü ADB:** Program açılırken `./bin/adb.exe`'yi geçici klasöre çıkarır ve kullanır.
3.  **Universal Backup:** Split APK, App Bundle ve OBB desteği.
4.  **Hybrid Root Support:** Rootlu cihazlarda uygulama verilerini (`/data/data`) tam yedekleme.
5.  **Smart Debloater:** Paketleri güvenlik derecelerine (Safe, Unsafe vb.) göre sınıflandırma ve açıklama sunma. [YENİ]
6.  **Real-time Sideload:** Terminal üzerinden % ilerleme çubuğu ile gerçek zamanlı ROM/Güncelleme yükleme. [YENİ]
7.  **Gerçek Zamanlı Log:** Tüm işlemler terminal üzerinden izlenebilir.
8.  **Yedek Yönetimi:** İstenmeyen yedek dosyalarını doğrudan arayüzden silme.

---
