# EasyADB'ye Katkıda Bulunma

[English](CONTRIBUTING.md)

Yardımınız için teşekkürler. Bu rehber projenin nasıl kurulacağını ve bir pull request'in nelere ihtiyaç duyduğunu anlatır.

## Kurulum

[README](README.tr.md#gereksinimler) içindeki gereksinimleri kurun, ardından:

```sh
npm install
npm run adb:fetch
npx playwright install chromium
npm run tauri dev
```

## Proje kuralları

* **Tek adb giriş noktası.** Tüm adb ve fastboot çağrıları `src-tauri/src/adb/client.rs` üzerinden geçer. Cihaz kabuk komutları `adb::shell::quote` veya `join` ile oluşturulur, güvenilmeyen metin asla birleştirilmez.
* **Özellikler klasördür.** Rust kodu `src-tauri/src/features/<ad>` içinde, eşleşen ekran `src/features/<ad>` içinde durur.
* **Üretilen tipler.** `src/bindings.ts` dosyasını elle düzenlemeyin. Rust tiplerini değiştirip `npm run test:rust` çalıştırın, dosya yeniden üretilir. Commit edilen dosya eskiyse CI başarısız olur.
* **İki dil.** Kullanıcıya görünen her metin hem `src/app/i18n/en.json` hem `src/app/i18n/tr.json` dosyasına girer. Anahtarların eşleştiğini bir test kontrol eder.
* **Küçük dosyalar.** Kaynak dosyalar 400 satırı geçmesin; veri dosyaları bunun dışındadır.
* **Geri alınamaz işlemleri** arayüzde `useConfirm` ile onaylatın.

## Pull request açmadan önce

```sh
npm run lint
npm run format:check
npx tsc --noEmit
npm run test:all
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
```

Gerçek cihaza dokunan değişiklikleri elle deneyin ve pull request'te neyi denediğinizi yazın.

## Commit mesajları

Kısa bir İngilizce özet satırı ve bir Türkçe özet satırı kullanın. Her biri en fazla 72 karakter olsun ve emir kipinde yazılsın. Önekler: `Add:`/`Ekle:`, `Fix:`/`Düzelt:`, `Change:`/`Değiştir:`, `Remove:`/`Sil:`, `Docs:`/`Belge:`.

```
Add: dark mode toggle
Ekle: karanlık mod anahtarı
```

## Lisans

Katkıda bulunarak katkılarınızın GPL-3.0 ile lisanslanmasını kabul etmiş olursunuz.
