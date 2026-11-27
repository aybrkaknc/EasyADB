# EasyADB ve EasyAndroid birlikte çalışma sözleşmesi

EasyAndroid (`com.aybrkaknc.easyandroid`) telefonda çalışan, root gerektiren yedek ve debloat uygulamasıdır. EasyADB aynı işi PC'den ADB ile yapar. İki uygulama aynı yedek klasörü, aynı debloat profili ve aynı koruma kurallarıyla çalışır. Bu belge ortak sözleşmedir. Değişiklik gerekirse önce bu belge ve EasyADB güncellenir, sonra EasyAndroid.

## 1. Yedek klasörü

```text
<kök>/<paket>_<YYYYMMDD-HHMMSS>/
  manifest.json            en son yazılır; olmayan klasör eksik yedektir
  apk/base.apk, apk/split_*.apk
  obb/<dosyalar>           isteğe bağlı
  data.tar | data.tar.zst  isteğe bağlı, root gerekir
  data_de.tar[.zst]        isteğe bağlı (extras)
  data_ext.tar[.zst]       isteğe bağlı (extras)
```

- EasyADB varsayılan kökü: `Belgelerim\EasyADB\Backups`. EasyAndroid: `/sdcard/EasyAndroid/Backups`.
- `data*.tar` içinde tek üst klasör vardır: paket adı. Ayıklama hedefi üst klasördür (`/data/data`, `/data/user_de/0`, `/data/media/0/Android/data`).
- Telefondaki dosyaların sistem ayarı JSON'ları (`system_<zaman>.json`) aynı kökte durur, klasör değildir.

## 2. manifest.json

Anahtarlar camelCase'dir. `formatVersion`:

- `1`: sıkıştırmasız. EasyADB ve EasyAndroid yazar ve okur.
- `2`: arşivler zstd ile sıkıştırılmıştır (`*.tar.zst`). EasyAndroid yazar. EasyADB okur (bkz. 3), yazmaz.

| Alan | Tür | Not |
|---|---|---|
| `formatVersion` | sayı | 1 veya 2 |
| `appVersion` | metin | yedeği alan uygulamanın sürümü |
| `package` | metin | paket adı, doğrulanır |
| `label` | metin? | görünen ad |
| `versionName` | metin? | |
| `createdAt` | metin | ISO 8601 |
| `device` | nesne | `model`, `serial`, `androidVersion`, `sdk` |
| `files[]` | liste | `kind` (`apk`/`obb`/`data`), `stored`, `name`, `size`, `sha256` |
| `permissions[]` | liste | `name`, `granted` |
| `extras[]` | liste | `kind` (`device_data`/`external_data`), `stored`, `size`, `sha256` |
| `appOps[]` | liste | `op`, `mode` |
| `batteryExempt` | boolean | pil optimizasyonu istisnası |

`extras`, `appOps`, `batteryExempt` isteğe bağlıdır; yoksa boş/false sayılır. `stored` yolları göreli, `/` ile ve klasör dışına çıkmayan yollar olmalıdır.

SHA-256 ve boyut, diskte duran (sıkıştırılmış olabilen) dosya üzerinden hesaplanır.

## 3. zstd

EasyADB zstd arşivleri PC'de çözer ve düz tar olarak cihaza gönderir. Cihazda `zstd` programı gerekmez. Çözülen geçici dosya işlem sonunda silinir.

## 4. Geri yükleme kuralları

Seçenekler EasyAndroid ile aynı eşlenir:

- **Veri** seçeneği: `data.tar*` ve `extras[]` (`device_data`, `external_data`) birlikte açılır. Root gerekir. Root yoksa uygulama yine kurulur, veri atlanır ve kullanıcıya bildirilir.
- **İzinler** seçeneği: `permissions[]` (`pm grant`), `appOps[]` (`cmd appops set --user 0`) ve `batteryExempt` (`dumpsys deviceidle whitelist +<paket>`) birlikte uygulanır.
- Uygulama kurulumu her zaman yapılır.
- İzin ve app op adları `[A-Za-z0-9._]{1,199}` desenine uymalıdır. App op yalnızca şu kullanıcı op'larıdır: `SYSTEM_ALERT_WINDOW`, `WRITE_SETTINGS`, `REQUEST_INSTALL_PACKAGES`, `MANAGE_EXTERNAL_STORAGE`, `GET_USAGE_STATS`, `PICTURE_IN_PICTURE`, `RUN_IN_BACKGROUND`, `RUN_ANY_IN_BACKGROUND`, `SCHEDULE_EXACT_ALARM`, `MANAGE_MEDIA`, `USE_FULL_SCREEN_INTENT`, `AUTO_REVOKE_PERMISSIONS_IF_UNUSED`. Kabul edilen modlar: `allow`, `ignore`, `deny`, `default`, `foreground`.
- Ek veri sahipliği: `device_data` için uygulamanın uid'si ve gid'i `/data/user_de/0/<paket>` üzerinde korunur. `external_data` için SDK 30 ve üstünde `uid:ext_data_rw`, daha eskisinde `media_rw:media_rw`.

EasyADB yedek alırken `appOps` ve `batteryExempt` yazar. `extras` arşivlerini yazmaz, yalnızca geri yükler.

## 5. Debloat

Profil formatı ortaktır:

```json
{ "format": "easyadb-debloat-profile", "version": 1, "name": "…", "createdAt": "…",
  "entries": [{ "package": "com.a", "action": "disable" }] }
```

Eylemler: `disable`, `enable`, `uninstall`, `restore`. Veritabanı (`debloat_db.json`) UAD-NG'den alınmıştır (GPL-3.0) ve iki projede aynıdır.

Koruma: `disable` ve `uninstall` şu paketler için reddedilir:

- `com.android.systemui`, `com.android.settings`, `com.android.shell`
- veritabanında `removal: "Unsafe"` olan paketler

## 6. Sistem ayarı yedeği

`system_<YYYYMMDD-HHMMSS>.json`, `format: "easyandroid-system"`, `version: 1`. Alanlar: `createdAt`, `device`, `settings` (`system`/`secure`/`global` → anahtar/değer), `roles` (rol → paket listesi), `wifi[]` (`ssid`, `security`, `password?`).

Anahtar adı `[A-Za-z0-9._]{1,199}` olmalı ve kimlik, güvenlik, SIM veya durum bilgisi taşıyan anahtarlar (örnek: `android_id`, `bluetooth_`, `setup_`, `adb_`, `lock_`, `token`, `password`, `sim_`, `wifi_on`, `airplane_mode_on`) geri yüklenmez. Tam engel listesi kaynakta `core/SystemBackup.kt` içindedir ve EasyADB'de `system_backup.rs` ile aynıdır.

EasyADB yalnızca yaygın tercihleri uygular (EasyAndroid'in varsayılan seçtiği `COMMON` listesi: ekran zaman aşımı, yazı boyutu, koyu tema vb.). Cihazdaki değerle aynı olan ayarlar atlanır. Ayarlar `settings put --user 0`, roller `cmd role add-role-holder --user 0`, Wi-Fi ağları `cmd wifi add-network` ile düz cihaz kabuğundan uygulanır; root gerekmez. Wi-Fi şifreleri yedek dosyasında düz metindir, bu yüzden Wi-Fi geri yüklemesi varsayılan olarak kapalıdır. Başarısız her öğe raporda ayrı sayılır, işlem durmaz.

Roller: `android.app.role.{BROWSER,DIALER,SMS,HOME,ASSISTANT,CALL_SCREENING,CALL_REDIRECTION}`. Wi-Fi güvenlik değerleri: `open`, `owe`, `wpa2`, `wpa3`.

## 7. Telefondan PC'ye çekme

EasyADB cihaz bağlanınca `/sdcard/EasyAndroid/Backups` altında yedek ve `system_*.json` dosyası arar (PC'de zaten olanlar atlanır). Bulursa kullanıcıya sorar. Yedek root gerektiren veri içeriyorsa (data veya extras) kullanıcı, kabuğa (shell) root izni vermesi gerektiği konusunda uyarılır; izin verilmezse bu dosyalar okunamayabilir. Onay verilirse yedekler EasyADB yedek klasörüne çekilir; her dosyanın boyutu ve SHA-256'sı `manifest.json` ile doğrulanır, manifest en son yazılır. Dosyalar önce düz kabukla okunur; okunamazsa ve kullanıcı root verdiyse `su -c cat` ile yeniden denenir. Sistem ayarı dosyaları aynı klasöre kopyalanır. Daha sonra Geri yükle sekmesinden geri yüklenir.

Yalnızca varsayılan klasör taranır. EasyAndroid'de seçilmiş başka bir klasör (SAF) taranmaz.

## 8. Dosya yedekleri (`files.json`)

Mesajlar, arama kayıtları, klasörler, duvar kâğıtları ve medya için EasyAndroid `<tür>_<YYYYMMDD-HHMMSS>/` klasörü yazar: `files.json` (en son yazılır) ve `0.tar`, `1.tar`, ... EasyADB bu klasörleri yalnızca kopyalar ve doğrular, içeriği ayıklamaz ve geri yüklemez.

`files.json`: `format: "easyandroid-files"`, `version: 1`, `kind` (`media`, `folders`, `wallpaper`, `calls`, `messages`), `appVersion`, `createdAt`, `device`, `items[]` (`parent`, `names[]`, `stored`, `size`, `sha256`). Geçerli yerler: `folders` ve `media` için `parent` yalnızca `/storage/emulated/0`, adlar `Android`, `EasyAndroid` ve nokta ile başlayan olmayan tek klasör adı; diğer türler için sabit yer ve ad listesi EasyAndroid `core/FileSets.kt` içindedir.

EasyADB PC'den klasör yedeği alırken (`tar -cf - -C /storage/emulated/0 <klasör>`) aynı biçimi yazar: `kind: "folders"`, `parent: "/storage/emulated/0"`, `0.tar`, `1.tar`. Böylece EasyAndroid onları geri yükleyebilir. PC'deki dosya yedekleri **Telefona gönder** ile telefonun yedek klasörüne kopyalanır. EasyADB var olan bir klasörün üzerine yazmaz.

## 9. Posta kutusu

PC ile telefon arasında iş istemek için ağ gerekmez. Klasör `/data/local/tmp/easyandroid/` (`shell:shell`, `0770`). Yalnızca shell ve root okur. EasyAndroid dosyaları root ile yazar ve `chown shell:shell` yapar, EasyADB `adb shell` ile yazar. Her yazma önce `*.tmp` dosyasına, sonra `mv` ile yapılır.

| Dosya | Yazan | İçerik |
|---|---|---|
| `pc` | EasyADB | `1 <telefon saniyesi>`. Her yoklamada yenilenir. 10 saniyeden eskiyse PC bağlı değildir. |
| `request.json` | EasyAndroid | Telefondan PC'ye iş isteği |
| `request.running`, `request.owner` | EasyADB | Süren istek ve onu alan PC'nin kimliği |
| `cancel` | EasyAndroid | İptal edilecek isteğin `id` değeri. Yalnızca EasyADB, kendi işlediği `id` ile siler |
| `status.json` | EasyADB | İstek durumu |
| `job.json` | EasyADB | PC'den telefona iş isteği |
| `job-status.json` | EasyAndroid | `job.json` durumu |
| `job-cancel` | EasyADB | İptal edilecek işin `id` değeri |
| `pc-backups.json` | EasyADB | PC'ye alınmış yedekler (aşağıda) |

**İstek** (`format: "easyandroid-request"`, `version: 1`): `id` (`[A-Za-z0-9-]{1,64}`), `batch` (tek dokunuşla gönderilen isteklerin ortak kimliği, `id` biçiminde), `index` (gruptaki sıra, 0'dan) ve `size` (gruptaki istek sayısı, en çok 1000), `created` (telefon saniyesi), `phone` (`ro.serialno`), `type` ve alanlar:

- `app`: `package`, `data`, `obb`, `externalData` (boolean), isteğe bağlı `label` (uygulamanın görünen adı; yalnız pencerelerde gösterilir, en çok 80 karakter). EasyADB `create.rs` ile PC'de `<paket>_<zaman>/` yedeği alır.
- `folders`: `names[]`. EasyADB klasörleri doğrudan PC'ye akıtır.
- `speed`: `megabytes` (1-256). EasyADB telefondan PC'ye ve PC'den telefona `megabytes` MB rastgele veri aktarır ve süreyi ölçer. Sonuç `notes[]` içinde `speed_to_pc:<MB/sn>` ve `speed_to_phone:<MB/sn>` olarak gelir (1 MB = 1.000.000 bayt).
- `pull`: `ids[]` (telefondaki yedek klasör adları: uygulama veya dosya yedeği) ve `system[]` (`system_<zaman>.json` dosya adları). En az biri dolu olmalıdır. EasyADB bunları PC'ye çeker, her dosyanın boyutunu ve SHA-256'sını doğrular.

`batch` yoksa istek tek başına bir gruptur (`batch=id`, `index=0`, `size=1`).

`created` ilk görüldüğünde 10 dakikadan eskiyse istek çalışmaz; PC'de onay veya sıra beklemek isteği eskitmez. EasyADB isteği `mv request.json request.running` ile sahiplenir ve `request.owner` dosyasına kendi kimliğini yazar; aynı telefon iki cihaz olarak görünse bile iş tek kez çalışır. EasyADB iş sırasında kapanırsa yeniden açıldığında kendi yarım isteğini `failed` (`interrupted`) olarak bitirir. Bağlantı koptuğu için yazılamayan son durum, telefon geri geldiğinde yazılır.

**Durum** (`status.json`): `id`, `state` (`waiting`, `running`, `done`, `failed`, `rejected`, `cancelled`), `stage` (`apk`, `obb`, `data`, `external`, `files`, `pull`, `speed`; `waiting` durumunda `approval` = PC'de onay bekleniyor, `busy` = telefonda PC'nin başka işi sürüyor, sırada), `item`, `done`, `total` (bayt), `seen[]` (o anki öğede veri taşıyan adımlar; telefon durumu aralıklarla okuduğu için kısa adımları buradan öğrenir. Alan yoksa telefon hiçbir adıma "yok" demez), `error` (kod ve ayrıntı; `rejected` durumunda `rejected`, `expired`, `ended` veya geçersizlik nedeni), `notes[]` (uyarı kodları: `data_skipped`, `data_failed`, `obb_failed`). EasyADB her saniye yazar ve her yoklamada `cancel` dosyasını okur. 20 saniye durum yazılmazsa EasyAndroid işi "bağlantı koptu" diye bitirir; EasyADB yarım klasörü siler.

**Güven.** EasyADB her grup için bir kez sorar: Reddet, Yalnızca bu sefer, Bu telefona güven. Yanıt grubun tamamını kapsar. 2 dakika yanıt verilmezse grup `expired` olur. Güven `ro.serialno` ile tutulur; güvenilen telefonun grubu sormadan başlar. `speed` her zaman sorulur ve güven seçeneği sunmaz. Reddedilen, süresi dolan, telefonu bulunamayan veya PC yok olan grubun kalan öğeleri telefonda denenmez. Grup; son öğe bitince, iptal veya retle ya da bir öğe bittikten sonra 20 saniye yeni istek gelmezse biter.

**Telefona iş** (`job.json`, `format: "easyandroid-job"`, `version: 1`): `id`, `created` (telefon saniyesi, 10 dakikadan eskiyse çalışmaz), `pc` (EasyADB'nin ürettiği kalıcı kimlik), `pcName` (bilgisayar adı), `type` ve alanlar:

- `files`: `kinds[]` (`messages`, `calls`, `wallpaper`). Klasörleri PC kendisi akıtır, bu iş onları içermez.
- `system`: sistem ayarı yedeği. Ayarlar ve varsayılan uygulamalar alınır, Wi-Fi ağları alınmaz.

EasyADB işi yazar ve EasyAndroid'in dışa kapalı `JobService`'ini root ile başlatır (`am start-foreground-service`). Başlamazsa ana ekranı açar. EasyAndroid dosyayı okur ve siler. PC güvenilmiyorsa kullanıcıya sorar (bildirim ve uygulama içi pencere): Reddet, Yalnızca bu sefer, Bu bilgisayara güven. Beklerken durum `waiting` olur (`stage`: `approval`, bildirim gösterilemiyorsa `open` ve EasyADB uygulamayı ekrana açar). Yanıt `rejected`, 2 dakika sonra `expired` olur. `pc` alanı boşsa her seferinde sorulur. Durum `job-status.json` dosyasındadır (istek durumuyla aynı biçim). Bittiğinde `notes[]` yapılan yedekleri bildirir: `id:<yedek klasörü>` ve `system:<system_*.json>`. EasyADB bunları bir `pull` gibi PC'ye çeker. `job-cancel` dosyası `id` değerini taşıyorsa EasyAndroid işi durdurur ve `cancelled` yazar. İş yalnızca bu dosyadan alınır, intent'ten değil.

**PC kaydı** (`pc-backups.json`): `[{ "package": "...", "versionName": "...", "createdAt": "..." }]` (en yeni 500 kayıt). EasyADB PC'ye uygulama yedeği aldığında ekler; EasyAndroid "bekleyen" ve "güncellenen" hesabında kullanır.

Güvenlik: telefondaki onay bir güvenlik sınırı değildir; yalnızca EasyAndroid'in çalıştırdığı işleri kapsar. Shell'e root verilen telefonla eşleşmiş her PC telefonda root komutu çalıştırabilir. Bu zaten EasyADB'nin yedek ve geri yükleme özelliğinin koşuludur.

## 10. PC'ye yedek alırken kurallar

`app` isteğinde ve EasyADB'nin kendi yedeğinde aynı davranış geçerlidir:

- Veri seçiliyse uygulama önce `am force-stop --user 0` ile kapatılır (korumalı paketler ve EasyAndroid hariç).
- `data.tar`: `tar -cf - -C /data/data --exclude <paket>/cache --exclude <paket>/code_cache --exclude <paket>/lib <paket>`. `data_de.tar` (`/data/user_de/0`) ve isteğe bağlı `data_ext.tar` (`/data/media/0/Android/data`) `extras` olarak yazılır.
- Akışın çıkış kodu telefonda bir dosyaya yazılır ve okunur. Sıfır dışı kod, EasyAndroid'deki zararsız `tar` uyarıları (`unknown file type`, `No such file or directory`, `removing leading`) hariç, bozuk arşivdir: arşiv silinir, APK ve izinler kalır, sonuç uyarıdır.
- Boş alan yetmiyorsa iş başlamaz.
