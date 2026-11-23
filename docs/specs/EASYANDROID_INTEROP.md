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
