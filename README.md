<a id="readme-top"></a>

<p align="center">
  <a href="README.tr.md">Türkçe</a>
</p>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]



<br />
<div align="center">
  <h3 align="center">EasyADB</h3>

  <p align="center">
    A desktop GUI for backing up, restoring, debloating and managing Android devices over ADB, without typing ADB commands.
    <br />
    <a href="https://github.com/aybrkaknc/EasyADB/issues/new?labels=bug">Report Bug</a>
    |
    <a href="https://github.com/aybrkaknc/EasyADB/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>



<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



## About The Project

I switch ROMs often. Backing up a phone usually means backing up to the phone first (with SwiftBackup or similar apps) and then copying huge files to the PC over USB. EasyADB removes that middle step.

EasyADB lets you:
- Back up apps and data **directly** to your PC storage.
- Restore them back to the device with a single click.
- Debloat, sideload and inspect the device from a GUI.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

[![Tauri][tauri-shield]][tauri-url]
[![Rust][rust-shield]][rust-url]
[![React][react-shield]][react-url]
[![TypeScript][typescript-shield]][typescript-url]
[![Vite][vite-shield]][vite-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Getting Started

Follow these steps to run EasyADB locally.

### Prerequisites

* Node.js (LTS)
  ```sh
  winget install OpenJS.NodeJS.LTS
  ```
* Rust (stable), installed with rustup
  ```sh
  winget install Rustlang.Rustup
  ```
* Tauri 2 prerequisites for Windows (WebView2 and the MSVC build tools). See the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

ADB is embedded in the app, so you do not need to install it separately.

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/aybrkaknc/EasyADB.git
   ```
2. Enter the project folder
   ```sh
   cd EasyADB
   ```
3. Install NPM packages
   ```sh
   npm install
   ```
4. Start the app in development mode
   ```sh
   npm run tauri dev
   ```
5. Build a release binary (optional)
   ```sh
   npm run tauri build
   ```
6. Run the tests (optional)
   ```sh
   npm test
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Usage

* **Direct Backup and Restore:** Streams APKs, split APKs (App Bundles), OBB files and, with root access, app data straight to your PC. Restore from `.easybckp` backups in one click.
* **Smart Debloater:** Separates system and user packages, uninstalls or disables them in batches, and re-enables them when needed. A safety list (based on UAD-NG) warns before you touch critical packages.
* **Terminal:** An ADB terminal with command history, word suggestions and package name completion.
* **Sideload:** Flash ZIP/OTA/ROM files and install APKs with a progress bar. Detects Recovery, Sideload and Bootloader mode.
* **Performance and Hardware:** Live CPU, RAM and battery monitoring, plus SoC, screen and OS details.
* **Smart Error Analysis:** Translates ADB errors into plain-language explanations and suggested fixes.

_Debloating system packages can break your device. Back up first and read the warnings before you act._

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Roadmap

- [ ] **Phase 1: Connection and Distribution (next)**
    - [ ] Wireless debugging wizard (QR code or IP)
    - [ ] Packaging as `.exe` and `.msi` (portable mode)
    - [ ] Import/export debloat profiles
- [ ] **Phase 2: File Explorer (planned)**
    - [ ] Live folder navigation
    - [ ] Create, delete, move and rename files and folders
    - [ ] Drag-and-drop push/pull with progress
    - [ ] Preview for images and APK files
- [ ] **Phase 3: Logcat Viewer (planned)**
    - [ ] Real-time virtualized log stream
    - [ ] Filtering by level and tag
    - [ ] Regex search and highlighting
    - [ ] Session export

See the [open issues](https://github.com/aybrkaknc/EasyADB/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Contributing

Contributions are welcome. If you have a suggestion, fork the repo and create a pull request, or open an issue with the tag "enhancement".

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add: AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## License

No license has been chosen for this project yet.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Contact

Ayberk - [@aybrkaknc](https://github.com/aybrkaknc)

Project Link: [https://github.com/aybrkaknc/EasyADB](https://github.com/aybrkaknc/EasyADB)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Acknowledgments

* [Best-README-Template](https://github.com/othneildrew/Best-README-Template) by othneildrew
* [Universal Android Debloater Next Generation](https://github.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation) for the debloat safety list
* [Tauri](https://tauri.app/), [React](https://react.dev/) and [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)

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
