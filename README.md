<a id="readme-top"></a>

<p align="center">
  <a href="README.tr.md">Türkçe</a>
</p>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![License][license-shield]][license-url]



<br />
<div align="center">
  <a href="https://github.com/aybrkaknc/EasyADB">
    <img src="docs/icons/icon.png" alt="EasyADB logo" width="120">
  </a>

  <h3 align="center">EasyADB</h3>

  <p align="center">
    A Windows desktop app for backing up, restoring, debloating and managing Android devices over ADB, without typing ADB commands.
    <br />
    <a href="https://github.com/aybrkaknc/EasyADB/releases">Download</a>
    |
    <a href="https://github.com/aybrkaknc/EasyADB/issues/new?template=bug_report.md">Report Bug</a>
    |
    <a href="https://github.com/aybrkaknc/EasyADB/issues/new?template=feature_request.md">Request Feature</a>
  </p>
</div>



<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#features">Features</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#installer">Installer</a></li>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#development">Development</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



## About The Project

Switching ROMs usually means backing up to the phone first and then copying large files to the PC. EasyADB backs apps up straight to your PC over ADB and restores them after a fresh flash. It bundles ADB, so nothing else has to be installed.

### Screenshots

Screenshots will be added with the next release.

### Features

* **Multiple devices:** USB and Wi-Fi devices at the same time, with a device selector and step-by-step help for unauthorized or offline devices.
* **Backup and restore:** APKs and split APKs, OBB files and, with root, app data. Backups are plain folders with a versioned manifest and SHA-256 checksums, so restoring is fast. Runtime permissions are saved too and can be granted again on restore. Without root, only the app is restored and you are told that its data was skipped. Select several backups to restore them in one go. Export or import a single `.easybckp` file.
* **Straight to the PC:** Stream apps and folders to this PC without using space on the phone, ask EasyAndroid on the phone for messages, call logs, wallpapers and system settings, and let the phone start backups here itself. A phone is trusted once and removed again in Settings. Copies on the phone are only deleted after the PC copy is checked and you say so.
* **Debloater:** Package descriptions and safety levels from the UAD-NG list, batch disable, enable, remove and restore, and profiles you can save and re-apply after a new ROM.
* **Wireless debugging:** Pairing code, QR code, manual IP and `adb tcpip` for older devices. Saved devices reconnect with one click.
* **Terminal:** Runs adb and fastboot commands with live output, history, completion and cancel.
* **Files:** Browse the device, create, rename, move and delete, and copy files between PC and device.
* **Logcat:** Live log with level and tag filters, regex search with highlighting, recording to a file and export.
* **Performance:** Live CPU, RAM, battery and storage, hardware inventory and network details.
* **Install and reboot:** Install an APK, sideload a ZIP and reboot into system, recovery, bootloader, sideload or fastbootd.
* **Comfort:** English and Turkish, keyboard shortcuts, tray icon, Windows notifications and confirmations for irreversible actions.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

[![Tauri][tauri-shield]][tauri-url]
[![Rust][rust-shield]][rust-url]
[![React][react-shield]][react-url]
[![TypeScript][typescript-shield]][typescript-url]
[![Vite][vite-shield]][vite-url]
[![Tailwind CSS][tailwind-shield]][tailwind-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Getting Started

### Installer

Download the latest `.msi` from the [Releases](https://github.com/aybrkaknc/EasyADB/releases) page. The installer is available in English and Turkish and installs WebView2 if it is missing.

### Prerequisites

To build from source on Windows 10 or 11 (x64):

* Node.js (LTS)
  ```sh
  winget install OpenJS.NodeJS.LTS
  ```
* Rust (stable)
  ```sh
  winget install Rustlang.Rustup
  ```
* Visual Studio Build Tools with the C++ workload
  ```sh
  winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/aybrkaknc/EasyADB.git
   cd EasyADB
   ```
2. Install NPM packages
   ```sh
   npm install
   ```
3. Start the app. The first run downloads a pinned, SHA-256 verified copy of Android platform-tools into `src-tauri/binaries`.
   ```sh
   npm run tauri dev
   ```
4. Build the installer (optional). The `.msi` is written to `src-tauri/target/release/bundle/msi`.
   ```sh
   npm run tauri build
   ```

`cargo` commands inside `src-tauri` need the binaries too. Run `npm run adb:fetch` once before using them.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Usage

1. Enable Developer options and USB debugging on the phone, connect it and accept the authorization prompt.
2. Pick the device in the selector at the top. Every module works on the selected device.
3. Use the icon rail or `Ctrl+1` to `Ctrl+9` to switch modules. `F5` refreshes, `Ctrl+F` focuses the search box.

Backups are saved to `Documents\EasyADB\Backups` by default. You can change the folder in Settings.

_Removing system packages can break your device. Read the safety level of each package before you remove it. Removed packages can be restored from the Debloat module._

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Development

```
src-tauri/src/
  adb/        single adb client, shell quoting, shared parsers
  features/   one module per feature: commands and logic
  lib.rs      plugin setup and command registration
src/
  app/        shell, store, i18n
  features/   one folder per module view
  shared/     hooks, UI components, helpers
  bindings.ts generated from Rust by tauri-specta
e2e/          Playwright tests against a mocked backend
```

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Vitest unit and component tests |
| `npm run test:e2e` | Playwright end-to-end tests (`npx playwright install chromium` once) |
| `npm run test:rust` | Rust unit tests; also regenerates `src/bindings.ts` |
| `npm run test:all` | All of the above tests |

See [docs/specs/ARCHITECTURE.md](docs/specs/ARCHITECTURE.md) (Turkish) for the design.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Roadmap

- [x] v0.2.0: rewrite with the features listed above
- [ ] Drag and drop upload in the file manager
- [ ] Image and APK previews
- [ ] Logcat filter by app or PID
- [ ] Split APK and multiple APK install
- [ ] High contrast mode

See the [open issues](https://github.com/aybrkaknc/EasyADB/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report security issues as described in [SECURITY.md](SECURITY.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## License

Distributed under the GNU General Public License v3.0. See [LICENSE](LICENSE) for more information.

EasyADB bundles:
* [Android SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools), Apache License 2.0. Its notice file is installed as `licenses/platform-tools-NOTICE.txt`.
* Package data from [Universal Android Debloater Next Generation](https://github.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation), GPL-3.0.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Contact

Ayberk - [@aybrkaknc](https://github.com/aybrkaknc)

Project Link: [https://github.com/aybrkaknc/EasyADB](https://github.com/aybrkaknc/EasyADB)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Acknowledgments

* [Best-README-Template](https://github.com/othneildrew/Best-README-Template) by othneildrew
* [Universal Android Debloater Next Generation](https://github.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation)
* [Tauri](https://tauri.app/), [tauri-specta](https://github.com/specta-rs/tauri-specta), [Radix](https://www.radix-ui.com/) and [TanStack Query](https://tanstack.com/query)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS AND IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/aybrkaknc/EasyADB.svg?style=for-the-badge
[contributors-url]: https://github.com/aybrkaknc/EasyADB/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/aybrkaknc/EasyADB.svg?style=for-the-badge
[forks-url]: https://github.com/aybrkaknc/EasyADB/network/members
[stars-shield]: https://img.shields.io/github/stars/aybrkaknc/EasyADB.svg?style=for-the-badge
[stars-url]: https://github.com/aybrkaknc/EasyADB/stargazers
[issues-shield]: https://img.shields.io/github/issues/aybrkaknc/EasyADB.svg?style=for-the-badge
[issues-url]: https://github.com/aybrkaknc/EasyADB/issues
[license-shield]: https://img.shields.io/github/license/aybrkaknc/EasyADB.svg?style=for-the-badge
[license-url]: https://github.com/aybrkaknc/EasyADB/blob/main/LICENSE
[tauri-shield]: https://img.shields.io/badge/Tauri_2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white
[tauri-url]: https://tauri.app/
[rust-shield]: https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white
[rust-url]: https://www.rust-lang.org/
[react-shield]: https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[react-url]: https://react.dev/
[typescript-shield]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[vite-shield]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[vite-url]: https://vitejs.dev/
[tailwind-shield]: https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white
[tailwind-url]: https://tailwindcss.com/
