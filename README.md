# EasyADB - Hacker Edition ⚡

**Advanced Android Backup Tool for Windows**
*Powered by Tauri 2.0 (Rust) + React 19 + Tailwind CSS*

EasyADB, USB hata ayıklama üzerinden Android uygulamalarınızı hızlıca yedekleyip geri yüklemenizi sağlayan, tamamen taşınabilir ve şık bir terminal arayüzüne sahip modern bir araçtır.

## ✨ Öne Çıkan Özellikler

- 🟢 **Hacker Terminal UI:** Retro-modern, scanline efektli ve neon yeşili arayüz.
- 📦 **Embedded ADB:** Bilgisayarınızda ADB kurulu olmasına gerek yok; uygulama içinde gömülü gelir.
- 🔄 **Backup & Restore Modes:** Sidebar sekmeleri üzerinden tek tıkla mod değişimi.
- 📜 **Real-time Logs:** Tüm ADB işlemlerini anlık olarak takip edebileceğiniz terminal paneli.
- ⚡ **Real-time Sideload:** Terminal üzerinden % ilerleme görerek ROM/Zip yükleme. [YENİ]
- 🛡️ **Smart Debloater:** Paket açıklamaları ve güvenlik dereceleri (UAD-NG entegrasyonu). [YENİ]
- 🔍 **Smart Search:** Yüzlerce uygulama içinden paket ismine göre anında filtreleme.
- ⚡ **Batch Processing:** Çoklu seçim yaparak toplu yedekleme veya geri yükleme.
- 📦 **Universal Format:** Split APK, OBB ve Root verisi desteği.
- 🔓 **Root Support:** Root'lu cihazlarda tam uygulama verisi yedekleme.

## 🚀 Başlarken

1.  **Geliştirme Ortamı:**
    ```powershell
    npm install
    npm run tauri dev
    ```

2.  **Dökümantasyon:**
    Tüm teknik detaylar ve yol haritası için `docs/` klasörüne göz atın:
    - [Yol Haritası (Roadmap)](./docs/plans/ROADMAP.md)
    - [Mimari Detaylar](./docs/specs/ARCHITECTURE.md)
    - [Tasarım Standartları (ADB_UI)](./docs/ui-ux/ADB_UI.md)

## 🛠 Teknoloji Yığını

- **Backend:** Rust (Tauri 2.0)
- **Frontend:** React 19, TypeScript, Lucide Icons
- **Styling:** Tailwind CSS (Custom Dark/Neon Theme)
- **Data Flow:** Tauri IPC (Invoke/Events)

---
*Developed with Passion by EasyADB Team*
