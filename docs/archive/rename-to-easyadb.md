# Task: Rename Project to EasyADB

## Goal
Rename all occurrences of "EasyBackupADB" to "EasyADB" across the entire codebase, configuration files, and documentation.

## Status
- [x] Phase 1: Search and Identify Files
- [x] Phase 2: Update Configuration Files
- [x] Phase 3: Update UI and Source Code
- [x] Phase 4: Update Documentation
- [x] Phase 5: Verification

## Assumptions
- Display Name: **EasyADB**
- Kebab Name: **easy-adb**
- Identifier: **com.easyadb.app** (New)
- Folder renaming: Deferred (to avoid terminal issues)

## Affected Files (Tentative)
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src/App.tsx`
- `src/components/modules/DebloaterModule.tsx`
- `docs/design/UI_UX_Overhaul_Plan.md`
- `docs/design/ADB_UI_SPEC.md`
