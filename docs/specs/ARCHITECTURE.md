# EasyADB Mimarisi (v0.2.0)

## 1. Genel bakış

EasyADB bir Tauri 2 uygulamasıdır. Rust tarafı ADB ile konuşur, dosya işlerini yapar ve tipli komutlar sunar. React tarafı yalnızca arayüzdür. İki taraf arasındaki tüm tipler `tauri-specta` ile Rust'tan üretilir (`src/bindings.ts`).

```
React (src/)  --commands-->  Rust (src-tauri/src/)  --process-->  adb.exe / fastboot.exe
              <--events----
```

## 2. Rust tarafı

```
src-tauri/src/
  lib.rs        eklentiler, komut ve olay kaydı, kurulum
  error.rs      AppError { code, detail }; code arayüzde çevrilir
  state.rs      AppState: adb istemcisi, görev kaydı; blocking() yardımcısı
  tasks.rs      iptal edilebilir görevler ve TaskProgress olayları
  stream.rs     süreç çıktısını satır satır akıtma
  store.rs      tauri-plugin-store ile ayarlar ve kayıtlı veriler
  tray.rs       tepsi simgesi ve menüsü
  events.rs     TaskProgress, CommandOutput
  adb/
    client.rs   Adb (tek giriş noktası), AdbRunner trait'i, Device
    shell.rs    cihaz kabuğu için tırnaklama ve doğrulama
    parse.rs    ortak ayrıştırıcılar (devices, packages, getprop)
    fake.rs     testler için sahte AdbRunner
  features/     device, packages, backup/, debloat, wireless, terminal,
                sideload, performance, files, logcat, settings
```

### 2.1 ADB çağrıları

* Tüm süreçler `Adb` üzerinden `CREATE_NO_WINDOW` ile, argüman dizisi olarak başlatılır.
* `adb shell` argümanlarını tek bir metin olarak cihaza gönderdiği için cihaz tarafındaki her argüman `shell::quote` ile tırnaklanır. Paket adları ve cihaz yolları kullanılmadan önce doğrulanır.
* Özellik mantığı `&dyn AdbRunner` veya `Device` alır. Böylece birim testleri `FakeAdb` ile cihazsız çalışır.
* Uzun işler `blocking()` ile ayrı iş parçacığında çalışır ve `TaskProgress` olayı gönderir. `cancel_task` görevi işaretler ve bağlı süreci öldürür.

### 2.2 ADB ikilileri

`scripts/fetch-platform-tools.ps1` sabit sürümlü platform-tools paketini indirir, SHA-256 ile doğrular ve `src-tauri/binaries` içine koyar. `adb.exe` ve `fastboot.exe` Tauri sidecar (`externalBin`), DLL'ler `resources` olarak paketlenir ve uygulamanın yanına kurulur. Çalışma anında `AppState::new` bunları uygulama klasöründe bulur.

### 2.3 Windows test manifest'i

`tauri-build` Common Controls v6 manifest'ini yalnızca çalıştırılabilir dosyaya gömer. Birim test dosyaları da tauri'ye bağlandığı için manifest olmadan `0xc0000139` hatasıyla çöker. `build.rs` bu yüzden aynı manifest'i `embed-resource` ile tüm hedeflere gömer.

## 3. Yedek biçimi (v1)

Her yedek bir klasördür:

```
<kök>/<paket>_<YYYYMMDD-HHMMSS>/
  manifest.json
  apk/base.apk, apk/split_*.apk
  obb/<dosyalar>          (isteğe bağlı)
  data.tar                (isteğe bağlı, root)
```

* `manifest.json` biçim sürümünü, paket bilgisini, cihaz özetini ve her dosyanın düz metin boyutu ile SHA-256 değerini tutar.
* Dosyalar `adb exec-out cat` ile akıtılır; özet ve (seçildiyse) şifreleme aynı geçişte yapılır. Uygulama verisi `su -c "tar -cf - ..."` ile doğrudan bilgisayara akar, telefona geçici dosya yazılmaz.
* Şifreleme isteğe bağlıdır: Argon2id ile anahtar türetilir, dosyalar 1 MiB'lık AES-256-GCM parçalarıyla şifrelenir (`.enc`). Her parçanın nonce'u ve ek verisi sıra numarasını ve son parça bilgisini içerir; sıra değişikliği, kesme ve ekleme algılanır. Manifest'teki kontrol değeri yanlış parolayı geri yüklemeden önce yakalar.
* Geri yüklemede varsayılan olarak boyut kontrol edilir, istenirse tam SHA-256 doğrulanır. Tek dosya gerektiğinde klasör sıkıştırmasız bir zip (`.easybckp`) olarak dışa aktarılır; içe aktarmada yol geçişi engellenir.

## 4. Frontend

```
src/
  app/          App, zustand deposu (modül, seçili cihaz), i18n, kabuk
  features/     her modül için ekran ve yardımcıları
  shared/
    hooks/      useDevices, useSettings, useTask, useSelection, useConfirm, useFeedback
    ui/         Radix tabanlı bileşenler, DeviceGuard, TaskBar, Toaster
    lib/        biçimlendirme ve hata metinleri
  bindings.ts   üretilir, elle düzenlenmez
```

* Sunucu durumu TanStack Query ile tutulur. Cihaz listesi 2 saniyede bir yenilenir; seçili cihaz kaybolursa hazır bir cihaz seçilir.
* `DeviceGuard`, modüllerin yalnızca uygun durumda bir cihazla açılmasını sağlar; aksi durumda adım adım rehber gösterir.
* Bir modül ilk açıldıktan sonra bağlı kalır, böylece terminal geçmişi ve logcat akışı modül değiştirince kaybolmaz.
* Tüm metinler `en.json` ve `tr.json` içindedir; dil ayarı yoksa sistem dili kullanılır.

## 5. Testler

* Rust: ayrıştırıcılar, şifreleme, manifest, arşiv, sahte ADB ile komut mantığı. `export_bindings` testi `src/bindings.ts` dosyasını yeniden üretir.
* Vitest: çeviri anahtarları, yardımcılar, hook'lar ve bileşenler.
* Playwright: arayüz `vite --mode e2e` ile tarayıcıda açılır, Tauri IPC `src/test/e2e/mockBackend.ts` tarafından yanıtlanır.

## 6. Arayüz tasarımı

Görsel dil için [ADB_UI.md](../ui-ux/ADB_UI.md) dosyasına bakın.
