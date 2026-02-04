# EasyADB

**"Because manually copying backups from phone to PC is annoying."**

> *I'm sure there is a tool out there that does this better.*

![Tauri](https://img.shields.io/badge/Tauri-2.0-orange.svg?style=flat-square)
![Rust](https://img.shields.io/badge/Backend-Rust-black.svg?style=flat-square)
![React](https://img.shields.io/badge/Frontend-React_19-blue.svg?style=flat-square)

## Why I Built This?

As someone who constantly switches ROMs, I built this tool to solve my own problem. It's incredibly annoying to have to backup on the phone first (via SwiftBackup etc.) and then transfer huge files to the PC via USB.

I wanted something faster and more direct.

**EasyADB** lets you:
- Backup **directly** to your PC storage (skip the middleman).
- Restore everything back with a single click.
- Do it all through a slick GUI without typing a single ADB command manually.

This is for enthusiasts like *us* who flash a new ROM every other week and hate the setup process.

## ✨ The Features

> No generic "Device Manager" stuff here. Only the tools power users actually need.

### 🔄 Direct Backup & Restore
Stop filling up your phone storage with backups. EasyADB streams everything directly to your hard drive. Supports Split APKs, OBBs, and if you have Root, it grabs the data too.

### 🛡️ Smart Debloater
Don't brick your phone removing `system_webview`. I integrated a safety list (UAD-NG based) that warns you before you nuke something critical.

### ⌨️ Terminal (For the purists)
Sometimes you just need to run `adb reboot bootloader`. I built a full terminal emulator right into the app with autocompletion. It even knows your package names.

### 🚀 Sideload Master
Flash zips, install APKs, or push files. It detects if you're in Recovery, Sideload, or Bootloader mode and just works.

## 🛠 Under the Hood

It's 2026, so I built this with the fastest stack I could find:
- **Rust (Tauri 2.0):** For the raw ADB communication and threaded performance.
- **React 19:** Because user interfaces should feel fast and fluid.
- **Embedded ADB:** You don't even need ADB installed on your system. It's portable.

## Getting Started

Grab the latest `.exe` from [Releases](https://github.com/aybrkaknc/EasyADB/releases). No installation needed, it's portable.

*Happy Flashing!*
