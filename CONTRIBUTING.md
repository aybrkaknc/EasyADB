# Contributing to EasyADB

[Türkçe](CONTRIBUTING.tr.md)

Thanks for helping. This guide explains how to set up the project and what a pull request needs.

## Setup

Follow the prerequisites in the [README](README.md#prerequisites), then:

```sh
npm install
npm run adb:fetch
npx playwright install chromium
npm run tauri dev
```

## Project rules

* **One adb entry point.** Every adb or fastboot call goes through `src-tauri/src/adb/client.rs`. Device shell commands are built with `adb::shell::quote` or `join`, never by concatenating untrusted text.
* **Features are folders.** Rust code lives in `src-tauri/src/features/<name>`, the matching view in `src/features/<name>`.
* **Generated types.** Do not edit `src/bindings.ts`. Change the Rust types and run `npm run test:rust`, which regenerates it. CI fails when the committed file is stale.
* **Two languages.** Every user-facing string goes into both `src/app/i18n/en.json` and `src/app/i18n/tr.json`. A test checks that the keys match.
* **Small files.** Keep source files under 400 lines; data files are the exception.
* **Confirm irreversible actions** in the UI with `useConfirm`.

## Before you open a pull request

```sh
npm run lint
npm run format:check
npx tsc --noEmit
npm run test:all
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
```

Test changes that touch a real device by hand, and describe what you tried in the pull request.

## Commit messages

Use a short English summary line and a Turkish summary line, each at most 72 characters, in the imperative mood. Prefixes: `Add:`/`Ekle:`, `Fix:`/`Düzelt:`, `Change:`/`Değiştir:`, `Remove:`/`Sil:`, `Docs:`/`Belge:`.

```
Add: dark mode toggle
Ekle: karanlık mod anahtarı
```

## License

By contributing you agree that your contributions are licensed under the GPL-3.0.
