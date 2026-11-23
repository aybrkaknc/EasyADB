# EasyADB v0.2.0 Yeniden Yazım Planı

> Eski kod `0b64699` commit'inde referans olarak durur. Yeniden yazım `main` dalında, eski `src/` ve `src-tauri/src/` silinerek yapılır. Ara aşamalarda uygulama çalışmayabilir.

## Kararlar

### Yığın
- Tauri 2 + Rust, React 19 + TypeScript + Vite + Tailwind 4. Paket yöneticisi npm, Node LTS, Rust stable.
- Tipler `tauri-specta` ile Rust'tan üretilir. Uyumsuzluk çıkarsa durulur ve kullanıcıya sorulur.
- Durum: TanStack Query (sunucu durumu) + zustand (arayüz durumu).
- UI: ADB_UI koyu tema + Radix ilkelleri. Yalnızca koyu tema.
- Dil: `react-i18next`, sistem dili algılanır (TR/EN), ayarlardan değiştirilir. Rust hataları kod + ayrıntı olarak gelir, metin arayüzde çevrilir.
- Saklama: `tauri-plugin-store` ile tek JSON deposu (ayarlar, cihaz önbelleği, kayıtlı kablosuz cihazlar, etiketler).
- Günlük: `tauri-plugin-log`, 3 dosya x 5 MB dönen, ayarlardan açılır ve dışa aktarılır. Telemetri yok.
- Platform yalnızca Windows. Lisans GPL-3.0-only.

### ADB ikilileri
- `scripts/fetch-platform-tools.ps1` sabit sürümü (r37.0.3) indirir, SHA-256 doğrular, `src-tauri/binaries/` içine koyar. Repoya binary eklenmez.
- `adb.exe` ve `fastboot.exe` sidecar (`externalBin`), DLL'ler `resources` olarak paketlenir. Çalışma anında uygulama klasöründen çağrılır.
- Sürüm yükseltmesi elle yapılır: betikteki sürüm ve hash birlikte değişir.

### Özellikler (hepsi v0.2.0'da)
- **Cihaz:** birden fazla cihaz (USB + Wi-Fi), üstte cihaz seçici, bağlantı türü, yetkisiz/offline/bağlı değil durumları için adım adım rehber.
- **Yedekleme:** sıkıştırmasız klasör + sürümlü `manifest.json`. Tek dosya için sıkıştırmasız zip (`.easybckp`) dışa aktarma. Eski biçim okunmaz.
  - Kapsam: APK + split (her zaman), OBB (varsayılan açık), uygulama verisi (yalnızca root, kullanıcı seçer), sistem uygulamaları filtreden seçilir.
  - Veri `adb exec-out su -c "tar -cf - ..."` ile doğrudan PC'ye akar, telefona geçici dosya yazılmaz.
  - İsteğe bağlı parola ile şifreleme (AES-256-GCM, Argon2), varsayılan kapalı.
  - Bütünlük: varsayılan boyut + manifest kontrolü, isteğe bağlı tam SHA-256.
  - Varsayılan konum: `Belgeler\EasyADB\Yedekler\<paket>_<tarih>`, ayarlardan değişir.
- **Debloat:** UAD-NG listesi + mevcut kayıtlar JSON olarak gömülü. Devre dışı bırak, etkinleştir, kaldır (`--user 0`), yeniden yükle (`install-existing`). Kaldırmadan önce otomatik yedek yok. Profil içe/dışa aktarma.
- **Kablosuz:** eşleştirme kodu (`adb pair`), QR ile eşleştirme (mDNS), manuel IP, `adb tcpip 5555`. Kayıtlı cihazlar açılışta otomatik bağlanmaz.
- **Terminal:** komut komut çalıştırma, canlı çıktı akışı ve iptal; geçmiş, öneri, paket adı tamamlama. PTY yok.
- **Kurulum:** ZIP/ROM sideload (ilerlemeli) + tek APK kurma.
- **Performans:** CPU/RAM/pil (geçmiş grafiği), donanım envanteri, depolama ve sıcaklık, ağ/Wi-Fi bilgisi.
- **Dosyalar:** gezinme, push/pull (ilerlemeli), klasör oluştur/sil/taşı/yeniden adlandır.
- **Logcat:** seviye + etiket filtresi, regex arama ve vurgulama, oturumu dosyaya kaydet/dışa aktar.
- **Ayarlar:** dil, yedek konumu, bildirim ve ses (ayrı ayrı), onay diyalogları, günlük.

### Arayüz
- Soldaki simge çubuğu + içerik, üstte cihaz seçici.
- Özel başlık çubuğu, sistem tepsisine küçültme (tepsi menüsü: göster/çık).
- Pencere: son boyut/konum hatırlanır, tek örnek, minimum 900x600.
- Klavye kısayolları (Ctrl+1..9 modül, F5 yenile, Ctrl+F ara), tam klavye gezinme, odak halkası, aria etiketleri.
- Geri alınamaz işlemlerde onay diyaloğu, ayarlardan kapatılabilir.
- Başarı sesi ve Windows bildirimi, ayarlardan ayrı ayrı kapatılabilir.

### Güvenlik
- Tüm süreçler argüman dizisiyle başlatılır. Cihaz tarafında kabuğa giden metinler tek tırnakla kaçılır.
- Yedek ve dosya yolları doğrulanır (zip-slip ve yol dışına çıkma engellenir).
- Sıkı CSP, minimum Tauri capability.

### Kalite ve teslim
- ESLint + Prettier + rustfmt + clippy (`-D warnings`), CI'da zorunlu.
- Test: Rust birim testleri (ayrıştırıcılar, manifest, sahte ADB), Vitest (hook + bileşen), Playwright + sahte IPC ile e2e.
- CI: GitHub Actions (lint, test, derleme) + etiketle `.msi` yayını. `.msi` WebView2 bootstrapper ile, TR ve EN kurulum dili.
- Commit: her önemli adımda, İngilizce + Türkçe mesaj. Push en sonda ve onayla.
- Beklenmedik engelde durulur ve kullanıcıya sorulur.

## Hedef yapı
```
src-tauri/src/
  lib.rs  error.rs  store.rs  events.rs
  adb/        mod.rs  client.rs (Adb, AdbRunner)  parse.rs  shell.rs
  features/   device  wireless  backup  debloat  terminal  sideload  performance  files  logcat  settings
src/
  app/        App.tsx  store.ts  i18n/  shell/ (başlık çubuğu, simge çubuğu, cihaz seçici)
  features/<ad>/  use<Ad>.ts  <Ad>View.tsx  (+ bileşenler)
  shared/     ui/  hooks/  lib/
  bindings.ts (üretilir)
```

## Aşamalar
- [ ] 0. Hazırlık: bu belge, `LICENSE`, `.gitattributes`, CI iskeleti, ADB indirme betiği
- [ ] 1. Temiz zemin: `.agent/`, eski docs, eski `src/` ve `src-tauri/src/` silinir; bağımlılıklar güncellenir
- [ ] 2. Rust çekirdek: hata tipi, tek ADB istemcisi, ayrıştırıcılar + testler, depo
- [ ] 3. Rust özellikler (sıra: device, backup, debloat, wireless, terminal + sideload, performance, files, logcat)
- [ ] 4. Bindings: `tauri-specta` ile `src/bindings.ts`
- [ ] 5. Frontend altyapı: kabuk, başlık çubuğu, depo, Query, i18n, tema, ortak UI
- [ ] 6. Frontend özellikler
- [ ] 7. Testler: Vitest, Playwright e2e
- [ ] 8. CI ve `.msi` yayını
- [ ] 9. Belgeler: README (EN/TR), CONTRIBUTING (EN/TR), SECURITY, şablonlar, ARCHITECTURE, ROADMAP, CHANGELOG

## Bitti tanımı
- `cargo clippy -D warnings`, `cargo test`, `tsc --noEmit`, `eslint`, `npm test`, Playwright hatasız
- ADB'yi çağıran tek bir yer var, elle yazılmış IPC tipi yok
- Veri dosyaları dışında hiçbir dosya 400 satırı geçmiyor
- Tüm kullanıcı metinleri İngilizce ve Türkçe
- Kurulum paketi temiz makinede çalışıyor
