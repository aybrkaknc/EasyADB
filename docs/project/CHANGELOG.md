# Changelog

Tüm önemli değişiklikler bu dosyada belgelenir.

Format [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) standardına dayanır.
Versiyon numaralandırması [Semantic Versioning](https://semver.org/spec/v2.0.0.html) takip eder.

---

## [Yayınlanmamış]

### Eklenenler
- Telefondan PC'ye doğrudan yedekleme: EasyAndroid'in paylaşılan klasöre bıraktığı istekler yapılır ([sözleşme](../specs/EASYANDROID_INTEROP.md)). İlk istekte sorulur, "Bu telefona güven" sonrası sormadan çalışır. Ayarlar'da güvenilen telefonlar listelenir ve unutulabilir
- Uygulama yedeğinde `data_de`, isteğe bağlı `Android/data`, önbellek dışlama ve veri alınmadan önce uygulamayı kapatma
- "Klasörler" sekmesi: telefonun klasörlerini telefonda yer kaplamadan doğrudan PC'ye akıtır
- "Telefon verileri" sekmesi: mesaj, arama kaydı, duvar kâğıdı ve sistem ayarı yedeklerini EasyAndroid'e yaptırır ve PC'ye çeker
- `files.json` yedeklerini (mesaj, arama kaydı, klasör, duvar kâğıdı) telefondan çekme ve "Telefona gönder" ile telefona geri gönderme
- Çekilen yedeklerin telefondaki kopyasını, PC kopyası doğrulandıktan sonra ve her seferinde sorarak silme
- Yedek öncesi PC'de boş alan denetimi
- Onay, süreç ve sonuç pencereleri: telefonun istediği ve PC'den başlatılan bütün yedek, geri yükleme ve gönderme işlerinde. Süreçte adımlar, öğe sırası, hız ve kalan süre; sonuçta öğe öğe durum, neden ve başarısızları yeniden deneme. Sorunsuz sonuç 10 saniyede kapanır
- Telefonun çok uygulamalı isteği tek onay, tek süreç ve tek sonuçtur. Onay 2 dakika yanıtlanmazsa düşer
- Telefon bağlandığında "Bu telefona güvenilsin mi?" sorusu (Güven, Şimdi değil, Bir daha sorma)
- Aktarım hız testi: Ayarlar ve araçlar > Bağlantı bölümünden veya telefondan
- "Hata ayıklama bağlantısı" ekranı: USB (USB modu, TCP, kablodan kablosuza), Kablosuz (telefon listesi, QR, eşleştirme kodu, IP), Telefon ayarları (kablosuz hata ayıklama, yetki süresi, uyanık kalma, kurulum doğrulama, yetkili PC'ler, yetki iptali, USB hata ayıklamayı kapatma) ve PC (adb sunucusu) sekmeleri
- Eşleşmiş telefon ağda görününce kendiliğinden bağlanır; eşleştirme bitince bağlantı kurulur
- Kablo takılınca iş sürmüyorsa USB'ye geçilir; bağlantı gelip gidince kısa bildirim çıkar
- Cihaz ekranında bağlantı özeti
- PC'nin telefonda başlattığı iş telefonda da onaylanır; reddedildiği ve yanıtsız kaldığı PC'de görünür
- Aynı telefonda ikinci iş sıraya girer. İş sürerken Windows uykuya geçmez ve çıkış sorulur

### Değişenler
- "Kablosuz" modülünün yerini "Hata ayıklama bağlantısı" aldı. Performans ve Logcat "Ayarlar ve araçlar" ekranının sekmeleri oldu
- Ctrl+1...9 modül kısayolları kaldırıldı
- Genel ayarlar sol menülü bölümlere ayrıldı: Uygulama, Yedekleme, Telefonlar, Bağlantı, Tanılama, Hakkında. Güvenilen telefonlar model adıyla görünür; otomatik bağlanma ve hız testi Bağlantı bölümünde. Kısayol paneli kaldırıldı

### Düzeltilenler
- Telefon kablosuz bağlıyken QR bölümü boşuna "Telefon bekleniyor" demiyor
- Adında boşluk olan mDNS kayıtları doğru okunuyor; aynı telefon ağ listesinde bir kez görünüyor
- Ağ keşfiyle bağlanan telefonun bağlantısı kesilebiliyor
- Telefondan akıtılan arşivlerin çıkış kodu denetleniyor. Yarıda kesilen bir `data.tar` artık sağlam yedek sayılmıyor
- Uygulama verisi alınırken bağlantı koparsa yarım yedek "veri atlandı" diye saklanmıyor, siliniyor
- Birden çok telefon bağlıyken işin durumu yalnızca kendi telefonuna yazılıyor

---

## [0.2.0] - 2026-11-23

Uygulama sıfırdan yeniden yazıldı. Eski `.easybckp` yedekleri bu sürümle okunmaz.

### Eklenenler
- Birden fazla cihaz desteği, cihaz seçici ve yetkisiz/çevrimdışı cihazlar için adım adım rehber
- Klasör tabanlı yedek biçimi (v1): akışlı aktarım, SHA-256, çalışma zamanı izinlerinin yedeklenmesi ve isteğe bağlı geri verilmesi, toplu geri yükleme, `.easybckp` dışa/içe aktarma. Root yoksa uygulama kurulur, veri atlanır
- UAD-NG verileriyle debloat, toplu işlemler ve profiller
- Kablosuz hata ayıklama: eşleştirme kodu, QR kod, IP ve `adb tcpip`
- Canlı çıktılı ve iptal edilebilir terminal
- Dosya yöneticisi ve logcat görüntüleyici
- Ağ, depolama ve sıcaklık bilgileriyle performans modülü
- İngilizce ve Türkçe arayüz, klavye kısayolları, sistem tepsisi, Windows bildirimleri
- Sabit sürümlü ve SHA-256 doğrulamalı platform-tools; sidecar olarak paketleme
- `.msi` kurulum paketi (TR/EN, WebView2 bootstrapper), GitHub Actions CI ve yayın
- Rust, Vitest ve Playwright testleri
- EasyAndroid ile birlikte çalışma ([sözleşme](../specs/EASYANDROID_INTEROP.md)): format 2 (zstd) yedekler, ek veri arşivleri (`data_de`, `data_ext`), uygulama izinleri (app ops) ve pil istisnası okunup geri yüklenir
- Telefonda EasyAndroid yedeği varsa PC'ye çekme sorusu; root gerektiren veri için uyarı
- EasyAndroid sistem ayarı yedeğini (yaygın ayarlar, varsayılan uygulamalar, Wi-Fi) geri yükleme
- Cihaz bilgisinde EasyAndroid'in kurulu olup olmadığı
- Başlıkta ve cihaz listesinde root durumu ikonu; debloat satırlarında duruma göre düğmeler

### Değişenler
- Debloat: `systemui`, `settings`, `shell` ve UAD-NG listesindeki Güvensiz paketler devre dışı bırakılamaz veya kaldırılamaz (EasyAndroid ile aynı kural)
- Veri geri yüklemede sahip, kip ve SELinux etiketi arşiv açılmadan önce okunuyor; yükleyicinin verdiği yeni uid'e göre uygulanıyor
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
