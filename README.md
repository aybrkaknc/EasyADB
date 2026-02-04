# EasyADB

**Advanced Android Device Management Interface**

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2.0-orange.svg?style=flat-square)
![Rust](https://img.shields.io/badge/Backend-Rust-black.svg?style=flat-square)
![React](https://img.shields.io/badge/Frontend-React_19-blue.svg?style=flat-square)

EasyADB is a high-performance, local-first GUI aimed at power users and developers. Built on the Tauri framework, it combines the speed of a Rust backend with a modern, terminal-centric React frontend to manage Android devices without external dependencies.

## Key Features

- **Embedded Runtime:** Ships with isolated ADB/Fastboot binaries. No system-wide PATH configuration or external installation required.
- **Terminal-Centric UX:** Retro-futuristic, "hacker-styled" interface featuring real-time log streaming service and CRT visual effects.
- **Advanced Package Operations:**
  - **Batch Processing:** Multi-threaded backup and restore handling (supports Split APKs, OBB, and Root data).
  - **Smart Debloater:** Integrated package analysis using UAD-NG safety heuristics.
  - **Context-Aware Filter:** Fuzzy search and filtering across system/user packages.
- **Device Telemetry:**
  - Real-time CPU/RAM usage monitoring (500ms polling rate).
  - Live sideload progress tracking with state detection (Recovery/Fastboot/Sideload).

## Tech Stack

| Scope | Technology | Description |
|-------|------------|-------------|
| **Core** | Tauri 2.0 (Rust) | System bindings, IPC, and binary management. |
| **View** | React 19 | UI composition and state management. |
| **Logic** | TypeScript | Type-safe implementation of frontend logic. |
| **Style** | Tailwind CSS | Utility-first styling with custom design tokens. |

## Development

### Prerequisites

- **Node.js**: v18+ (LTS recommended)
- **Rust**: 1.75+ (stable)

### Setup & Run

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Dev Server**
   Launches the Tauri interface with Hot Module Replacement (HMR).
   ```bash
   npm run tauri dev
   ```

### Build

Compile the production binary for the host platform:

```bash
npm run tauri build
```

## Documentation

Project architecture and planning documents are located in `docs/`:

- [Roadmap](./docs/plans/ROADMAP.md)
- [Architecture Specs](./docs/specs/ARCHITECTURE.md)
- [UI Guidelines](./docs/ui-ux/ADB_UI.md)
